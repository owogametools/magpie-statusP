package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadCreatesDefaults(t *testing.T) {
	dir := t.TempDir()
	s, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	cfg := s.Get()
	if cfg.Version != Version || !cfg.Window.AlwaysOnTop || cfg.Hotkey != "Alt+Shift+M" {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
	if _, err := os.Stat(filepath.Join(dir, "config.json")); err != nil {
		t.Fatalf("config not written: %v", err)
	}
}

func TestUpdatePersistsAndBacksUp(t *testing.T) {
	dir := t.TempDir()
	s, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Update(func(c *Config) error {
		c.Magpie.Port = 4000
		c.Avatar.DefaultSet = "Codex"
		c.Avatar.Sets["Codex"] = map[string]string{"idle": "codex/idle.gif"}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	again, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	cfg := again.Get()
	if cfg.Magpie.Port != 4000 || cfg.Avatar.DefaultSet != "codex" {
		t.Fatalf("update not persisted: %+v", cfg)
	}
	if _, ok := cfg.Avatar.Sets["codex"]["idle"]; !ok {
		t.Fatalf("avatar set missing: %+v", cfg.Avatar.Sets)
	}
	if _, err := os.Stat(filepath.Join(dir, "config.json.bak")); err != nil {
		t.Fatalf("backup missing: %v", err)
	}
}

func TestUpdateRejectsBadValues(t *testing.T) {
	s, err := Load(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Update(func(c *Config) error {
		c.Magpie.Port = -1
		return nil
	}); err == nil {
		t.Fatal("negative port accepted")
	}
	cfg, err := s.Update(func(c *Config) error {
		c.Avatar.Sets["claude"] = map[string]string{"idle": "../escape.png"}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := cfg.Avatar.Sets["claude"]; ok {
		t.Fatal("escaping avatar path survived normalization")
	}
}

func TestCorruptConfigIsKept(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(dir); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "config.json.bad")); err != nil {
		t.Fatalf("bad config not kept: %v", err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, "config.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cfg Config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatalf("rewritten config invalid: %v", err)
	}
	if cfg.Version != Version {
		t.Fatalf("rewritten version = %d", cfg.Version)
	}
}

func TestNormalizeAvatarConfig(t *testing.T) {
	dir := t.TempDir()
	raw := []byte(`{
	  "version": 1,
	  "window": {"width": 10, "height": 10},
	  "avatar": {
	    "defaultSet": "",
	    "agentOrder": ["Claude Code", "claude", "Codex"],
	    "sets": {"Claude Code": {"idle": "claude/idle.png", "bogus": "x.png", "waiting": "../x.png"}}
	  }
	}`)
	if err := os.WriteFile(filepath.Join(dir, "config.json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	cfg := s.Get()
	if cfg.Window.Width != 440 || cfg.Window.Height != 640 {
		t.Fatalf("window not normalized: %+v", cfg.Window)
	}
	wantOrder := []string{"claude-code", "claude", "codex"}
	if len(cfg.Avatar.AgentOrder) != len(wantOrder) {
		t.Fatalf("order = %v", cfg.Avatar.AgentOrder)
	}
	for i := range wantOrder {
		if cfg.Avatar.AgentOrder[i] != wantOrder[i] {
			t.Fatalf("order = %v", cfg.Avatar.AgentOrder)
		}
	}
	if cfg.Avatar.DefaultSet != "claude-code" {
		t.Fatalf("default set = %q", cfg.Avatar.DefaultSet)
	}
	states := cfg.Avatar.Sets["claude-code"]
	if _, ok := states["bogus"]; ok {
		t.Fatal("unknown state kept")
	}
	if _, ok := states["waiting"]; ok {
		t.Fatal("escaping path kept")
	}
	if states["idle"] != "claude/idle.png" {
		t.Fatalf("idle = %q", states["idle"])
	}
}

func TestValidLanguage(t *testing.T) {
	valid := []string{"zh-TW", "zh-CN", "ja", "en"}
	for _, code := range valid {
		if !ValidLanguage(code) {
			t.Errorf("ValidLanguage(%q) = false, want true", code)
		}
	}
	invalid := []string{"", "zh", "zh-tw", "ZH-TW", "jp", "fr", "en-US"}
	for _, code := range invalid {
		if ValidLanguage(code) {
			t.Errorf("ValidLanguage(%q) = true, want false", code)
		}
	}
}

func TestNormalizeLanguage(t *testing.T) {
	cases := map[string]string{
		"zh-TW": "zh-TW",
		"zh-CN": "zh-CN",
		"ja":    "ja",
		"en":    "en",
		"":      "zh-TW",
		"fr":    "zh-TW",
		"zh":    "zh-TW",
	}
	for in, want := range cases {
		dir := t.TempDir()
		raw := []byte(`{"version":1,"language":"` + in + `"}`)
		if err := os.WriteFile(filepath.Join(dir, "config.json"), raw, 0o600); err != nil {
			t.Fatal(err)
		}
		s, err := Load(dir)
		if err != nil {
			t.Fatal(err)
		}
		if got := s.Get().Language; got != want {
			t.Errorf("language %q normalized to %q, want %q", in, got, want)
		}
	}
}

func TestKey(t *testing.T) {
	cases := map[string]string{
		"Claude Code":      "claude-code",
		"Claude":           "claude",
		"VS Code Insiders": "vs-code-insiders",
		"  Codex  ":        "codex",
		"":                 "",
	}
	for in, want := range cases {
		if got := Key(in); got != want {
			t.Errorf("Key(%q) = %q, want %q", in, got, want)
		}
	}
}
