package avatar

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"

	"app/internal/settings"
)

// defaultFiles holds the bundled set so a fresh install has an avatar for
// every state without a download.
//
//go:embed defaults/claude/*.gif
var defaultFiles embed.FS

// DefaultSet is the agent whose bundled images seed a first run.
const DefaultSet = "claude"

// InstallDefaults writes the bundled set under root/claude and returns the
// config paths for it. A file that already exists is left alone: the user may
// have replaced it, so only a missing state is filled in.
func InstallDefaults(root string) (map[string]string, error) {
	files := make(map[string][]byte, len(settings.AvatarStates))
	for _, state := range settings.AvatarStates {
		name := "defaults/" + DefaultSet + "/" + state + ".gif"
		b, err := defaultFiles.ReadFile(name)
		if err != nil {
			return nil, fmt.Errorf("read bundled avatar %s: %w", state, err)
		}
		if len(b) == 0 {
			return nil, fmt.Errorf("bundled avatar %s is empty", state)
		}
		files[state] = b
	}

	dir := filepath.Join(root, DefaultSet)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create avatar folder: %w", err)
	}
	installed := make(map[string]string, len(files))
	for _, state := range settings.AvatarStates {
		dest := filepath.Join(dir, state+".gif")
		if _, err := os.Stat(dest); err == nil {
			installed[state] = DefaultSet + "/" + state + ".gif"
			continue
		} else if !os.IsNotExist(err) {
			return nil, fmt.Errorf("check avatar %s: %w", state, err)
		}
		if err := writeFileAtomic(dest, files[state]); err != nil {
			return nil, fmt.Errorf("install avatar %s: %w", state, err)
		}
		installed[state] = DefaultSet + "/" + state + ".gif"
	}
	return installed, nil
}

// writeFileAtomic keeps a half-written GIF from ever reaching the resolver.
func writeFileAtomic(dest string, data []byte) error {
	f, err := os.CreateTemp(filepath.Dir(dest), filepath.Base(dest)+".tmp*")
	if err != nil {
		return err
	}
	tmp := f.Name()
	if _, err := f.Write(data); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	if err := os.Chmod(tmp, 0o644); err != nil {
		os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, dest); err != nil {
		os.Remove(tmp)
		return err
	}
	return nil
}
