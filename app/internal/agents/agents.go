// Package agents drives Magpie's own CLI: listing detected agents, their
// models, and changing a model or effort. The CLI is the documented surface;
// nothing here pokes at Magpie's internal window API.
package agents

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Agent is one row of `magpie ls`.
type Agent struct {
	Name        string   `json:"name"`
	Key         string   `json:"key"`
	Model       string   `json:"model"`
	Details     []string `json:"details"`
	Fields      []string `json:"fields"`
	Effort      string   `json:"effort"`
	EffortField string   `json:"effortField"`
	Path        string   `json:"path,omitempty"`
}

// Model is one entry of `magpie models <agent>`.
type Model struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Levels []string `json:"levels"`
}

var spaces = regexp.MustCompile(`\s{2,}`)

// magpieBinaryNames lists the CLI command and the per-platform release
// artifacts for this OS, so a downloaded or unpacked CLI is found without a
// rename. Cross-platform names are excluded: a Linux build is not launchable
// on Windows (and the reverse).
func magpieBinaryNames() []string {
	switch runtime.GOOS {
	case "windows":
		return []string{"magpie.exe", "magpie-windows-amd64.exe", "magpie-windows-arm64.exe", "magpie"}
	case "darwin":
		return []string{"magpie", "magpie-darwin-arm64", "magpie-darwin-amd64", "magpie-darwin-universal"}
	default:
		return []string{"magpie", "magpie-linux-amd64", "magpie-linux-arm64"}
	}
}

// Runner invokes one magpie binary.
type Runner struct {
	Bin string
}

// New locates the magpie CLI. override is the user's configured path.
func New(override string) *Runner {
	return &Runner{Bin: FindBinary(override)}
}

// Available reports whether a CLI was found.
func (r *Runner) Available() bool { return r != nil && r.Bin != "" }

var (
	foundMu   sync.Mutex
	foundPath string
)

// FindBinary looks for magpie in the user's PATH, beside the running app, in
// its usual install folders, and finally through the running process itself.
func FindBinary(override string) string {
	if p := usable(override); p != "" {
		return p
	}
	if p := usable(os.Getenv("MAGPIE_BIN")); p != "" {
		return p
	}
	for _, name := range magpieBinaryNames() {
		if p, err := exec.LookPath(name); err == nil {
			if p = usable(p); p != "" {
				return p
			}
		}
	}
	var dirs []string
	if d := os.Getenv("LOCALAPPDATA"); d != "" {
		dirs = append(dirs,
			filepath.Join(d, "Programs", "magpie"),
			filepath.Join(d, "magpie"),
			filepath.Join(d, "Magpie"),
		)
	}
	if d := os.Getenv("PROGRAMFILES"); d != "" {
		dirs = append(dirs, filepath.Join(d, "magpie"), filepath.Join(d, "Magpie"))
	}
	if runtime.GOOS == "darwin" {
		dirs = append(dirs,
			"/Applications/Magpie.app/Contents/MacOS",
			"/Applications/magpie.app/Contents/MacOS",
		)
	}
	if runtime.GOOS == "linux" {
		dirs = append(dirs,
			"/usr/local/bin",
			"/usr/bin",
			"/opt/magpie",
		)
	}
	if d, err := os.UserHomeDir(); err == nil {
		dirs = append(dirs, filepath.Join(d, ".magpie"), filepath.Join(d, "magpie"))
		if runtime.GOOS == "darwin" {
			dirs = append(dirs,
				filepath.Join(d, "Applications", "Magpie.app", "Contents", "MacOS"),
				filepath.Join(d, "Applications", "magpie.app", "Contents", "MacOS"),
			)
		}
		if runtime.GOOS == "linux" {
			dirs = append(dirs,
				filepath.Join(d, ".local", "bin"),
				filepath.Join(d, "go", "bin"),
			)
		}
	}
	for _, dir := range dirs {
		for _, name := range magpieBinaryNames() {
			if p := usable(filepath.Join(dir, name)); p != "" {
				return p
			}
		}
	}
	foundMu.Lock()
	defer foundMu.Unlock()
	if foundPath != "" && usable(foundPath) != "" {
		return foundPath
	}
	if runtime.GOOS == "windows" {
		if p := runningMagpie(); p != "" {
			foundPath = p
			return p
		}
	}
	return ""
}

func usable(p string) string {
	p = strings.Trim(strings.TrimSpace(p), `"`)
	if p == "" {
		return ""
	}
	st, err := os.Stat(p)
	if err != nil || st.IsDir() {
		return ""
	}
	return p
}

// runningMagpie asks Windows for the path of a running magpie process. Users
// often keep the app somewhere of their own; this finds it without asking.
func runningMagpie() string {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
		`(Get-Process -Name magpie* -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -First 1 -ExpandProperty Path)`)
	hide(cmd)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return usable(string(out))
}

// List runs `magpie ls` and parses its rows.
func (r *Runner) List(ctx context.Context) ([]Agent, error) {
	if !r.Available() {
		return nil, errors.New("magpie CLI not found")
	}
	out, err := r.run(ctx, "ls")
	if err != nil {
		return nil, err
	}
	return parseList(out), nil
}

func parseList(out string) []Agent {
	var list []Agent
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimRight(line, " \t\r")
		if !strings.HasPrefix(line, "  ") {
			continue
		}
		parts := spaces.Split(strings.TrimSpace(line), -1)
		if len(parts) < 2 {
			continue
		}
		a := Agent{Name: parts[0], Key: AgentKey(parts[0])}
		if p := parts[len(parts)-1]; looksLikePath(p) {
			a.Path = p
			parts = parts[:len(parts)-1]
		}
		var details []string
		for _, p := range parts[1:] {
			for _, d := range strings.Split(p, "·") {
				d = strings.TrimSpace(d)
				if d != "" {
					details = append(details, d)
				}
			}
		}
		a.Details = details
		a.Fields = fieldNames(details)
		if len(details) > 0 && details[0] != "—" {
			a.Model = details[0]
		}
		for _, d := range details {
			lower := strings.ToLower(d)
			switch {
			case strings.HasPrefix(lower, "effort "):
				a.EffortField = "effort"
				a.Effort = strings.TrimSpace(d[len("effort "):])
			case strings.HasPrefix(lower, "thinking "):
				a.EffortField = "thinking"
				a.Effort = strings.TrimSpace(d[len("thinking "):])
			}
		}
		list = append(list, a)
	}
	return list
}

// fieldNames pulls the setting names out of an ls row: a detail is
// "effort high" or a lone field such as "effort" when it is unset.
func fieldNames(details []string) []string {
	known := map[string]bool{
		"model": true, "effort": true, "thinking": true, "small": true,
		"opus": true, "sonnet": true, "haiku": true, "fable": true,
		"subagent": true, "ultracode": true, "auto mode": true,
	}
	var out []string
	seen := map[string]bool{}
	for _, d := range details {
		lower := strings.ToLower(d)
		name := lower
		if i := strings.IndexByte(lower, ' '); i > 0 {
			name = lower[:i]
		}
		if known[name] && !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	return out
}

// Models runs `magpie models <agent>` and parses the catalog it prints.
func (r *Runner) Models(ctx context.Context, agent string) ([]Model, error) {
	if !r.Available() {
		return nil, errors.New("magpie CLI not found")
	}
	out, err := r.run(ctx, "models", agent)
	if err != nil {
		return nil, err
	}
	return parseModels(out), nil
}

func parseModels(out string) []Model {
	var models []Model
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimRight(line, " \t\r")
		if !strings.HasPrefix(line, "  ") {
			continue
		}
		parts := spaces.Split(strings.TrimSpace(line), -1)
		if len(parts) < 2 || !strings.Contains(parts[0], "/") {
			continue
		}
		m := Model{ID: parts[0], Name: parts[1]}
		if len(parts) > 2 {
			for _, l := range strings.Split(parts[len(parts)-1], "/") {
				l = strings.TrimSpace(l)
				if l != "" && l != "—" && l != "-" {
					m.Levels = append(m.Levels, l)
				}
			}
		}
		models = append(models, m)
	}
	return models
}

// SetModel validates model against the agent's catalog and applies it, then
// applies effort when the model offers it. agent is the display name from
// `magpie ls`; both values are passed as separate arguments, never a shell.
func (r *Runner) SetModel(ctx context.Context, agent, model, effort string) (string, error) {
	if !r.Available() {
		return "", errors.New("magpie CLI not found")
	}
	models, err := r.Models(ctx, agent)
	if err != nil {
		return "", err
	}
	var picked *Model
	for i := range models {
		if models[i].ID == model {
			picked = &models[i]
			break
		}
	}
	if picked == nil {
		return "", fmt.Errorf("%s is not one of %s's models", model, agent)
	}
	if _, err := r.run(ctx, agent, model); err != nil {
		return "", err
	}
	if effort != "" {
		ok := false
		for _, l := range picked.Levels {
			if strings.EqualFold(l, effort) {
				ok = true
				break
			}
		}
		if !ok {
			return "", fmt.Errorf("%s does not offer effort %s", model, effort)
		}
		field := "effort"
		if strings.EqualFold(agent, "pi") || strings.EqualFold(agent, "Pi") {
			field = "thinking"
		}
		if _, err := r.run(ctx, agent, field, effort); err != nil {
			return "", err
		}
	}
	return fmt.Sprintf("%s → %s", agent, model), nil
}

// Open starts magpie with args and does not wait for it. Used for the tray
// panel and the app window.
func (r *Runner) Open(args ...string) error {
	if !r.Available() {
		return errors.New("magpie CLI not found")
	}
	cmd := exec.Command(r.Bin, args...)
	hide(cmd)
	cmd.Stdout, cmd.Stderr = nil, nil
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}

func (r *Runner) run(ctx context.Context, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, r.Bin, args...)
	hide(cmd)
	var stdout, stderr strings.Builder
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return "", fmt.Errorf("magpie %s timed out", strings.Join(args, " "))
	}
	if err != nil {
		if msg := meaningful(stderr.String()); msg != "" {
			return "", errors.New(msg)
		}
		if msg := meaningful(stdout.String()); msg != "" {
			return "", errors.New(msg)
		}
		return "", fmt.Errorf("magpie %s: %w", strings.Join(args, " "), err)
	}
	return stdout.String(), nil
}

// meaningful picks the last line that is not one of the plugin host's log
// lines, which every CLI call emits on stderr.
func meaningful(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" || strings.Contains(line, "plugin: host starts") || strings.Contains(line, "plugin [info]") {
			continue
		}
		return line
	}
	return ""
}

func looksLikePath(s string) bool {
	if strings.HasPrefix(s, "~") || strings.HasPrefix(s, "/") || strings.HasPrefix(s, `\\`) || strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") {
		return true
	}
	return len(s) > 2 && s[1] == ':' && (s[2] == '\\' || s[2] == '/')
}

// AgentKey maps the display names Magpie uses to the keys route events and
// avatar sets use.
func AgentKey(name string) string {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "claude code", "claude":
		return "claude"
	case "codex":
		return "codex"
	case "opencode":
		return "opencode"
	case "pi":
		return "pi"
	case "vs code":
		return "vscode"
	case "vs code insiders":
		return "vscode-insiders"
	case "copilot (jetbrains)":
		return "copilot"
	case "command code":
		return "commandcode"
	case "devin":
		return "devin"
	case "kimi code":
		return "kimicode"
	case "droid":
		return "droid"
	case "grok build", "grok":
		return "grok"
	case "t3 code":
		return "t3code"
	case "alma":
		return "alma"
	case "cindy":
		return "cindy"
	case "aionui":
		return "aionui"
	case "bun":
		return "bun"
	case "magpie":
		return "magpie"
	}
	key := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	for _, r := range key {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ' || r == '-' || r == '_' || r == '.':
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}
