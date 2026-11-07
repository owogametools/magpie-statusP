package agents

import (
	"context"
	"os"
	"testing"
)

const listSample = `2026/11/07 17:58:56 plugin: host starts
  Claude Code          group/smart[1m]  ·  effort high  ·  opus group/coder  ·  subagents group/smart[1m]  ·  opus effort high  ·  auto mode group/smart[1m]  ~\.claude\settings.json
  Codex                claude-sonnet  ·  effort high    ~\.codex\config.toml
  OpenCode             —  ·  small —    ~\.config\opencode\opencode.json
  VS Code              —    ~\AppData\Roaming\Code\User\settings.json
  T3 Code              provider magpie    ~\.t3\userdata\settings.json
  Alma                 magpie/group/smart    http://localhost:23001
`

func TestParseList(t *testing.T) {
	list := parseList(listSample)
	if len(list) != 6 {
		t.Fatalf("got %d agents: %+v", len(list), list)
	}
	claude := list[0]
	if claude.Name != "Claude Code" || claude.Key != "claude" {
		t.Fatalf("claude = %+v", claude)
	}
	if claude.Model != "group/smart[1m]" {
		t.Fatalf("model = %q", claude.Model)
	}
	if claude.EffortField != "effort" || claude.Effort != "high" {
		t.Fatalf("effort = %q/%q", claude.EffortField, claude.Effort)
	}
	if claude.Path != `~\.claude\settings.json` {
		t.Fatalf("path = %q", claude.Path)
	}
	if list[1].Key != "codex" || list[1].Model != "claude-sonnet" {
		t.Fatalf("codex = %+v", list[1])
	}
	if list[2].Model != "" {
		t.Fatalf("opencode model = %q", list[2].Model)
	}
	if list[3].Path == "" {
		t.Fatalf("vs code path missing: %+v", list[3])
	}
	if list[5].Path != "http://localhost:23001" {
		t.Fatalf("alma path = %q", list[5].Path)
	}
}

const modelsSample = `  Routing groups
  group/smart                                       magpie-smart  low/high
  group/coder                                       magpie-code  none/low/high/max
  auto/muse-spark-1.3-contributor-free              Muse Spark 1.3 Free  low/high
  Grok
  grok/grok-4.5@500k                                Grok 4.5 @ 500k  low/medium/high
`

func TestParseModels(t *testing.T) {
	models := parseModels(modelsSample)
	if len(models) != 4 {
		t.Fatalf("got %d models: %+v", len(models), models)
	}
	if models[0].ID != "group/smart" || models[0].Name != "magpie-smart" {
		t.Fatalf("first = %+v", models[0])
	}
	if len(models[0].Levels) != 2 || models[0].Levels[1] != "high" {
		t.Fatalf("levels = %v", models[0].Levels)
	}
	if models[2].Name != "Muse Spark 1.3 Free" {
		t.Fatalf("name = %q", models[2].Name)
	}
	if len(models[3].Levels) != 3 {
		t.Fatalf("grok levels = %v", models[3].Levels)
	}
}

func TestAgentKey(t *testing.T) {
	cases := map[string]string{
		"Claude Code": "claude", "Codex": "codex", "VS Code Insiders": "vscode-insiders",
		"Command Code": "commandcode", "Grok Build": "grok", "T3 Code": "t3code",
		"Something New": "something-new",
	}
	for in, want := range cases {
		if got := AgentKey(in); got != want {
			t.Errorf("AgentKey(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestLiveCLI exercises the real magpie binary when MAGPIE_LIVE=1.
func TestLiveCLI(t *testing.T) {
	if os.Getenv("MAGPIE_LIVE") == "" {
		t.Skip("set MAGPIE_LIVE=1 to run against the installed magpie")
	}
	r := New("")
	if !r.Available() {
		t.Fatal("magpie CLI not found")
	}
	list, err := r.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(list) == 0 {
		t.Fatal("no agents listed")
	}
	models, err := r.Models(context.Background(), list[0].Name)
	if err != nil {
		t.Fatal(err)
	}
	if len(models) == 0 {
		t.Fatalf("no models for %s", list[0].Name)
	}
	t.Logf("%d agents; %s has %d models", len(list), list[0].Name, len(models))
}
