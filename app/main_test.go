package main

import (
	"os"
	"path/filepath"
	"testing"

	"app/internal/avatar"
	"app/internal/settings"
)

func TestSeedDefaultAvatarsOnEmptyConfig(t *testing.T) {
	dir := t.TempDir()
	store, err := settings.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	avatarsDir := filepath.Join(dir, "avatars")
	if err := seedDefaultAvatars(store, avatarsDir); err != nil {
		t.Fatal(err)
	}
	cfg := store.Get()
	set := cfg.Avatar.Sets[avatar.DefaultSet]
	if len(set) != len(settings.AvatarStates) {
		t.Fatalf("claude set has %d states, want %d", len(set), len(settings.AvatarStates))
	}
	for _, state := range settings.AvatarStates {
		wantRel := avatar.DefaultSet + "/" + state + ".gif"
		if set[state] != wantRel {
			t.Fatalf("%s = %q, want %q", state, set[state], wantRel)
		}
		if _, err := os.Stat(filepath.Join(avatarsDir, avatar.DefaultSet, state+".gif")); err != nil {
			t.Fatalf("%s not written: %v", state, err)
		}
	}
	if cfg.Avatar.DefaultSet != avatar.DefaultSet {
		t.Fatalf("default set = %q", cfg.Avatar.DefaultSet)
	}
}

func TestSeedDefaultAvatarsLeavesCustomSetsAlone(t *testing.T) {
	dir := t.TempDir()
	store, err := settings.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Update(func(c *settings.Config) error {
		c.Avatar.Sets["codex"] = map[string]string{"idle": "codex/idle.gif"}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	avatarsDir := filepath.Join(dir, "avatars")
	if err := seedDefaultAvatars(store, avatarsDir); err != nil {
		t.Fatal(err)
	}
	cfg := store.Get()
	if len(cfg.Avatar.Sets) != 1 {
		t.Fatalf("sets = %+v", cfg.Avatar.Sets)
	}
	if cfg.Avatar.Sets["codex"]["idle"] != "codex/idle.gif" {
		t.Fatalf("custom set changed: %+v", cfg.Avatar.Sets)
	}
	if _, ok := cfg.Avatar.Sets[avatar.DefaultSet]; ok {
		t.Fatalf("default set was seeded: %+v", cfg.Avatar.Sets)
	}
	if _, err := os.Stat(avatarsDir); !os.IsNotExist(err) {
		t.Fatalf("avatars dir was written: %v", err)
	}
}
