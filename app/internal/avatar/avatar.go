// Package avatar owns the image sets behind the avatar tab: where files
// live, what answers when a state has none, and the avatar:// protocol
// handler that serves them to the page.
package avatar

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"app/internal/settings"
)

// MaxBytes caps one avatar file. A 20 MB GIF already makes a large GIF.
const MaxBytes = 20 << 20

var allowedExt = map[string]bool{".gif": true, ".png": true, ".webp": true}

// Resolver answers which image belongs to an agent in a state.
type Resolver struct {
	root string
	mu   sync.RWMutex
	cfg  settings.Avatar
}

// New returns a resolver serving files under root (normally
// <userData>/avatars).
func New(root string) *Resolver {
	return &Resolver{root: root, cfg: settings.Avatar{Sets: map[string]map[string]string{}}}
}

// Dir is the avatars directory.
func (r *Resolver) Dir() string { return r.root }

// SetConfig replaces the avatar configuration the resolver answers from.
func (r *Resolver) SetConfig(c settings.Avatar) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.cfg = c
}

// Config returns a copy of the current avatar configuration.
func (r *Resolver) Config() settings.Avatar {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return cloneAvatar(r.cfg)
}

// URL is Resolve's URL-only form.
func (r *Resolver) URL(agent, state string) (string, string, bool) {
	url, set, _, ok := r.Resolve(agent, state)
	return url, set, ok
}

// Resolve returns the image URL for agent/state, the set that answered, and
// whether the answer is the agent's own image rather than the default set's.
// The chain is agent set → default set → no image.
func (r *Resolver) Resolve(agent, state string) (url, set string, own, ok bool) {
	agent = settings.Key(agent)
	state = strings.ToLower(strings.TrimSpace(state))
	if !settings.ValidState(state) {
		return "", "", false, false
	}
	r.mu.RLock()
	cfg := cloneAvatar(r.cfg)
	r.mu.RUnlock()

	if rel, found := cfg.Sets[agent][state]; found {
		if full, err := r.file(rel); err == nil {
			return fileURL(rel, full), agent, true, true
		}
	}
	def := settings.Key(cfg.DefaultSet)
	if def != "" && def != agent {
		if rel, found := cfg.Sets[def][state]; found {
			if full, err := r.file(rel); err == nil {
				return fileURL(rel, full), def, false, true
			}
		}
	}
	return "", "", false, false
}

// SetFile returns the URL of a set's own entry, without the default-set
// fallback, for the avatar editor's previews.
func (r *Resolver) SetFile(agent, state string) (string, bool) {
	r.mu.RLock()
	cfg := cloneAvatar(r.cfg)
	r.mu.RUnlock()
	rel, ok := cfg.Sets[settings.Key(agent)][state]
	if !ok {
		return "", false
	}
	full, err := r.file(rel)
	if err != nil {
		return "", false
	}
	return fileURL(rel, full), true
}

// Save copies src into agent/state<ext> and returns the new relative path.
// The extension decides the format: GIF, PNG or WebP.
func (r *Resolver) Save(agent, state, src string) (string, error) {
	agent = settings.Key(agent)
	if agent == "" || settings.Key(agent) != agent {
		return "", errors.New("invalid agent")
	}
	state = strings.ToLower(strings.TrimSpace(state))
	if !settings.ValidState(state) {
		return "", fmt.Errorf("unknown avatar state %q", state)
	}
	ext := strings.ToLower(filepath.Ext(src))
	if !allowedExt[ext] {
		return "", errors.New("avatar must be a GIF, PNG or WebP file")
	}
	st, err := os.Stat(src)
	if err != nil {
		return "", fmt.Errorf("read image: %w", err)
	}
	if !st.Mode().IsRegular() {
		return "", errors.New("not a file")
	}
	if st.Size() <= 0 || st.Size() > MaxBytes {
		return "", fmt.Errorf("image is %s; the limit is 20 MB", humanSize(st.Size()))
	}
	dir := filepath.Join(r.root, agent)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create avatar folder: %w", err)
	}
	dest := filepath.Join(dir, state+ext)
	if err := copyFile(src, dest); err != nil {
		return "", err
	}
	for e := range allowedExt {
		if e != ext {
			_ = os.Remove(filepath.Join(dir, state+e))
		}
	}
	return path.Join(agent, state+ext), nil
}

// Clear removes every file for agent/state and returns the removed path.
func (r *Resolver) Clear(agent, state string) (string, error) {
	agent = settings.Key(agent)
	state = strings.ToLower(strings.TrimSpace(state))
	if !settings.ValidState(state) {
		return "", fmt.Errorf("unknown avatar state %q", state)
	}
	removed := ""
	for e := range allowedExt {
		full := filepath.Join(r.root, agent, state+e)
		if err := os.Remove(full); err == nil {
			removed = path.Join(agent, state+e)
		} else if !errors.Is(err, os.ErrNotExist) {
			return "", err
		}
	}
	return removed, nil
}

// file joins a configured relative path and refuses to leave the avatar
// directory or name a file that is gone.
func (r *Resolver) file(rel string) (string, error) {
	rel = path.Clean(filepath.ToSlash(rel))
	if rel == "." || strings.HasPrefix(rel, "../") || strings.HasPrefix(rel, "/") || strings.Contains(rel, ":") {
		return "", errors.New("path outside the avatar folder")
	}
	full := filepath.Join(r.root, filepath.FromSlash(rel))
	absRoot, err := filepath.Abs(r.root)
	if err != nil {
		return "", err
	}
	abs, err := filepath.Abs(full)
	if err != nil {
		return "", err
	}
	if abs != absRoot && !strings.HasPrefix(abs, absRoot+string(os.PathSeparator)) {
		return "", errors.New("path outside the avatar folder")
	}
	if st, err := os.Stat(full); err != nil || !st.Mode().IsRegular() {
		return "", os.ErrNotExist
	}
	return full, nil
}

// ServeHTTP serves files under the avatars root. It is mounted as the
// avatar scheme; on Windows the page asks for avatar.localhost.
func (r *Resolver) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	p := req.URL.Path
	if p == "" || p == "/" {
		http.NotFound(w, req)
		return
	}
	full, err := r.file(strings.TrimPrefix(p, "/"))
	if err != nil {
		http.NotFound(w, req)
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeFile(w, req, full)
}

func fileURL(rel, full string) string {
	rel = strings.TrimPrefix(filepath.ToSlash(rel), "/")
	parts := strings.Split(rel, "/")
	for i := range parts {
		parts[i] = neturl.PathEscape(parts[i])
	}
	v := time.Now().Unix()
	if st, err := os.Stat(full); err == nil {
		v = st.ModTime().UnixNano()
	}
	host := "avatar://localhost/"
	if runtime.GOOS == "windows" {
		// WebView2 serves a scheme at http://<scheme>.localhost/.
		host = "http://avatar.localhost/"
	}
	return host + strings.Join(parts, "/") + "?v=" + fmt.Sprint(v)
}

func copyFile(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dest + ".tmp"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, dest); err != nil {
		os.Remove(tmp)
		return err
	}
	return nil
}

func humanSize(n int64) string {
	if n >= 1<<20 {
		return fmt.Sprintf("%.1f MB", float64(n)/(1<<20))
	}
	return fmt.Sprintf("%.0f KB", float64(n)/(1<<10))
}

func cloneAvatar(a settings.Avatar) settings.Avatar {
	out := settings.Avatar{DefaultSet: a.DefaultSet, AgentOrder: append([]string(nil), a.AgentOrder...), Sets: map[string]map[string]string{}}
	for agent, states := range a.Sets {
		m := make(map[string]string, len(states))
		for k, v := range states {
			m[k] = v
		}
		out.Sets[agent] = m
	}
	return out
}
