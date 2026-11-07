package avatar

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"app/internal/settings"
)

func TestBundledDefaultsComplete(t *testing.T) {
	for _, state := range settings.AvatarStates {
		b, err := defaultFiles.ReadFile("defaults/" + DefaultSet + "/" + state + ".gif")
		if err != nil {
			t.Fatalf("%s: %v", state, err)
		}
		if len(b) == 0 {
			t.Fatalf("%s is empty", state)
		}
	}
}

func TestBundledDefaultsExactlySevenStates(t *testing.T) {
	entries, err := defaultFiles.ReadDir("defaults/" + DefaultSet)
	if err != nil {
		t.Fatal(err)
	}
	want := make(map[string]bool, len(settings.AvatarStates))
	for _, state := range settings.AvatarStates {
		want[state+".gif"] = true
	}
	if len(entries) != len(want) {
		t.Fatalf("bundled %d files, want %d", len(entries), len(want))
	}
	for _, e := range entries {
		if e.IsDir() || !want[e.Name()] {
			t.Fatalf("unexpected bundled file %q", e.Name())
		}
		delete(want, e.Name())
	}
	if len(want) != 0 {
		t.Fatalf("missing bundled files: %v", want)
	}
}

func TestInstallDefaultsWritesAllStates(t *testing.T) {
	root := t.TempDir()
	got, err := InstallDefaults(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != len(settings.AvatarStates) {
		t.Fatalf("installed %d states, want %d", len(got), len(settings.AvatarStates))
	}
	for _, state := range settings.AvatarStates {
		wantRel := DefaultSet + "/" + state + ".gif"
		if got[state] != wantRel {
			t.Fatalf("%s = %q, want %q", state, got[state], wantRel)
		}
		want, err := defaultFiles.ReadFile("defaults/" + DefaultSet + "/" + state + ".gif")
		if err != nil {
			t.Fatal(err)
		}
		have, err := os.ReadFile(filepath.Join(root, DefaultSet, state+".gif"))
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(have, want) {
			t.Fatalf("%s differs from the bundled file", state)
		}
	}
}

func TestInstallDefaultsKeepsExistingFile(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, DefaultSet)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(dir, "idle.gif")
	custom := []byte("CUSTOMGIF")
	if err := os.WriteFile(dest, custom, 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := InstallDefaults(root)
	if err != nil {
		t.Fatal(err)
	}
	if got["idle"] != DefaultSet+"/idle.gif" {
		t.Fatalf("idle = %q", got["idle"])
	}
	have, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(have, custom) {
		t.Fatal("existing file was overwritten")
	}
	if _, err := os.Stat(filepath.Join(dir, "streaming.gif")); err != nil {
		t.Fatalf("missing state was not installed: %v", err)
	}
}
