// Package settings owns Magpie Panel's config.json: its schema, defaults,
// validation and atomic saves. Nothing here talks to Magpie or the UI.
package settings

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// Version is the schema version written to new files. Bump it and add a
// migration in normalize when a field changes meaning.
const Version = 1

// Avatar states, in a fixed order so every surface lists them alike.
var AvatarStates = []string{"idle", "routing", "waiting", "streaming", "fallback", "failed", "offline"}

// Config is Magpie Panel's whole configuration.
type Config struct {
	Version   int    `json:"version"`
	Magpie    Magpie `json:"magpie"`
	Window    Window `json:"window"`
	Hotkey    string `json:"hotkey"`
	Autostart bool   `json:"autostart"`
	Theme     string `json:"theme"`
	Language  string `json:"language"`
	Avatar    Avatar `json:"avatar"`
}

// Magpie locates the gateway and the CLI.
type Magpie struct {
	// Port 0 asks the app to read Magpie's own settings.json, then 3425.
	Port int `json:"port"`
	// BinaryPath overrides where the magpie CLI lives. Empty auto-detects.
	BinaryPath string `json:"binaryPath"`
}

// Window holds the window defaults; size and position themselves are kept by
// MyGo's StateKey.
type Window struct {
	AlwaysOnTop bool `json:"alwaysOnTop"`
	Width       int  `json:"width"`
	Height      int  `json:"height"`
}

// Avatar maps agents to the images shown for each state.
type Avatar struct {
	// DefaultSet is the agent whose images answer for a missing one.
	DefaultSet string `json:"defaultSet"`
	// AgentOrder decides which agent shows when several are active, highest
	// priority first.
	AgentOrder []string `json:"agentOrder"`
	// Sets[agent][state] is a path relative to the avatars directory.
	Sets map[string]map[string]string `json:"sets"`
}

// Default returns the configuration of a first run.
func Default() Config {
	return Config{
		Version: Version,
		Magpie:  Magpie{Port: 0, BinaryPath: ""},
		Window:  Window{AlwaysOnTop: true, Width: 440, Height: 640},
		Hotkey:  "Alt+Shift+M",
		// The panel is meant to be there after login; the settings tab turns
		// it off, and the tray menu too.
		Autostart: true,
		Theme:     "system",
		Language:  "zh-TW",
		Avatar: Avatar{
			DefaultSet: "claude",
			AgentOrder: []string{"claude", "codex", "gemini", "opencode", "magpie"},
			Sets:       map[string]map[string]string{},
		},
	}
}

// Store is a loaded config file. It is safe for concurrent use.
type Store struct {
	path string
	mu   sync.RWMutex
	cfg  Config
}

// Load reads dir/config.json, creating it with defaults when absent. A
// config.json that cannot be decoded is kept as config.json.bad and replaced
// with defaults rather than crashing the app.
func Load(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}
	s := &Store{path: filepath.Join(dir, "config.json"), cfg: Default()}
	raw, err := os.ReadFile(s.path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		if err := s.saveLocked(); err != nil {
			return nil, err
		}
		return s, nil
	case err != nil:
		return nil, fmt.Errorf("read config: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		_ = os.WriteFile(s.path+".bad", raw, 0o600)
		if err := s.saveLocked(); err != nil {
			return nil, err
		}
		return s, nil
	}
	normalize(&cfg)
	s.cfg = cfg
	if cfg.Version < Version {
		if err := s.saveLocked(); err != nil {
			return nil, err
		}
	}
	return s, nil
}

// Path is the config file's path.
func (s *Store) Path() string { return s.path }

// Dir is the directory holding config.json and avatars/.
func (s *Store) Dir() string { return filepath.Dir(s.path) }

// Get returns a deep copy of the current config.
func (s *Store) Get() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return clone(s.cfg)
}

// Update applies fn to a copy and saves it. The in-memory config only changes
// when the file has been written.
func (s *Store) Update(fn func(*Config) error) (Config, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := clone(s.cfg)
	if err := fn(&next); err != nil {
		return s.cfg, err
	}
	normalize(&next)
	if err := validate(next); err != nil {
		return s.cfg, err
	}
	if err := s.write(next); err != nil {
		return s.cfg, err
	}
	s.cfg = next
	return clone(next), nil
}

func (s *Store) saveLocked() error {
	if err := validate(s.cfg); err != nil {
		return err
	}
	return s.write(s.cfg)
}

// write saves cfg atomically, keeping the previous file as config.json.bak.
func (s *Store) write(cfg Config) error {
	b, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	b = append(b, '\n')
	if raw, err := os.ReadFile(s.path); err == nil {
		if err := os.WriteFile(s.path+".bak", raw, 0o600); err != nil {
			return fmt.Errorf("back up config: %w", err)
		}
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	if err := os.Rename(tmp, s.path); err != nil {
		// Windows refuses to replace a file another process has open; retry
		// once after removing the target.
		if removeErr := os.Remove(s.path); removeErr == nil {
			if err = os.Rename(tmp, s.path); err == nil {
				return nil
			}
		}
		return fmt.Errorf("replace config: %w", err)
	}
	return nil
}

// normalize folds a decoded or default config into a usable shape.
func normalize(c *Config) {
	if c.Version == 0 {
		c.Version = Version
	}
	if c.Window.Width < 320 || c.Window.Width > 1600 {
		c.Window.Width = 440
	}
	if c.Window.Height < 420 || c.Window.Height > 1600 {
		c.Window.Height = 640
	}
	switch c.Theme {
	case "system", "light", "dark":
	default:
		c.Theme = "system"
	}
	if !ValidLanguage(c.Language) {
		c.Language = "zh-TW"
	}
	if strings.TrimSpace(c.Hotkey) == "" {
		c.Hotkey = "Alt+Shift+M"
	}
	c.Avatar.DefaultSet = Key(c.Avatar.DefaultSet)
	if c.Avatar.Sets == nil {
		c.Avatar.Sets = map[string]map[string]string{}
	}
	sets := make(map[string]map[string]string, len(c.Avatar.Sets))
	for agent, states := range c.Avatar.Sets {
		key := Key(agent)
		if key == "" {
			continue
		}
		clean := map[string]string{}
		for state, rel := range states {
			if !ValidState(state) || !safeRel(rel) {
				continue
			}
			clean[state] = filepath.ToSlash(rel)
		}
		if len(clean) > 0 {
			sets[key] = clean
		}
	}
	c.Avatar.Sets = sets
	order := make([]string, 0, len(c.Avatar.AgentOrder))
	seen := map[string]bool{}
	for _, a := range c.Avatar.AgentOrder {
		k := Key(a)
		if k == "" || seen[k] {
			continue
		}
		seen[k] = true
		order = append(order, k)
	}
	if len(order) == 0 {
		order = []string{"claude", "codex", "gemini", "opencode", "magpie"}
	}
	c.Avatar.AgentOrder = order
	if c.Avatar.DefaultSet == "" {
		c.Avatar.DefaultSet = order[0]
	}
}

func validate(c Config) error {
	if c.Window.Width < 320 || c.Window.Height < 420 {
		return fmt.Errorf("window is too small")
	}
	if c.Magpie.Port < 0 || c.Magpie.Port > 65535 {
		return fmt.Errorf("invalid Magpie port %d", c.Magpie.Port)
	}
	if strings.TrimSpace(c.Hotkey) == "" {
		return fmt.Errorf("hotkey is empty")
	}
	for agent, states := range c.Avatar.Sets {
		if Key(agent) != agent {
			return fmt.Errorf("invalid agent key %q", agent)
		}
		for state, rel := range states {
			if !ValidState(state) || !safeRel(rel) {
				return fmt.Errorf("invalid avatar entry %s/%s", agent, state)
			}
		}
	}
	return nil
}

// ValidLanguage reports whether the panel supports a UI language code.
func ValidLanguage(code string) bool {
	switch code {
	case "zh-TW", "zh-CN", "ja", "en":
		return true
	}
	return false
}

// ValidState reports whether state is one of the seven avatar states.
func ValidState(state string) bool {
	for _, s := range AvatarStates {
		if s == state {
			return true
		}
	}
	return false
}

// Key turns an agent name into the key used in config and route events:
// lower case letters, digits, '-' and '_'.
func Key(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	lastDash := false
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '_':
			b.WriteRune(r)
			lastDash = false
		case r == '-' || r == ' ' || r == '.' || r == '/' || r == '\\':
			if !lastDash && b.Len() > 0 {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

// safeRel accepts a forward-slash path that stays inside the avatars tree.
func safeRel(rel string) bool {
	rel = filepath.ToSlash(strings.TrimSpace(rel))
	if rel == "" || strings.HasPrefix(rel, "/") || strings.Contains(rel, ":") {
		return false
	}
	for _, part := range strings.Split(rel, "/") {
		if part == "" || part == "." || part == ".." {
			return false
		}
	}
	return true
}

func clone(c Config) Config {
	out := c
	out.Avatar.AgentOrder = append([]string(nil), c.Avatar.AgentOrder...)
	out.Avatar.Sets = make(map[string]map[string]string, len(c.Avatar.Sets))
	for agent, states := range c.Avatar.Sets {
		m := make(map[string]string, len(states))
		for k, v := range states {
			m[k] = v
		}
		out.Avatar.Sets[agent] = m
	}
	return out
}
