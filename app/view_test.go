package main

import (
	"encoding/json"
	"testing"
	"time"

	"app/internal/magpie"
	"app/internal/panel"
)

func TestStateViewIsJSONFriendly(t *testing.T) {
	s := panel.Snapshot{
		Connected: true,
		Version:   "0.1.3193",
		Port:      3425,
		UpdatedAt: time.Date(2026, 11, 7, 18, 0, 0, 0, time.UTC),
		Today: magpie.Usage{
			Period: "today", Calls: 3, Errors: 1, Input: 100, Output: 20,
			CacheRead: 300, Cost: 1.25, Series: []magpie.Bucket{},
		},
		Quotas: []magpie.Quota{{
			Provider: "grok", Name: "Grok", Kind: "subscription",
			Windows: []magpie.QuotaWindow{{Name: "7 days", Used: 59, Remaining: 41, ResetsAt: "2026-11-08T09:58:11Z"}},
		}},
		Requests: []magpie.Request{{Time: "2026-11-07T18:00:02Z", Agent: "claude", Model: "x", Ms: 12, Status: 200}},
		Active:   []magpie.Route{{ID: "r1", Agent: "claude", Phase: "attempt", Attempt: 1}},
		Avatar:   panel.AvatarNow{Agent: "claude", State: "waiting", URL: "http://avatar.localhost/claude/waiting.gif", HasImage: true},
		AvatarSets: []panel.AvatarSet{{
			Agent:  "claude",
			States: []panel.AvatarState{{State: "idle", URL: "u", HasImage: true}},
		}},
		DefaultSet: "claude",
		AgentOrder: []string{"claude", "codex"},
	}
	cfg := ConfigView{Port: 3425, Hotkey: "Alt+Shift+M", AgentOrder: []string{"claude"}}
	v := stateView(s, cfg)

	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var round map[string]any
	if err := json.Unmarshal(b, &round); err != nil {
		t.Fatal(err)
	}
	if v.UpdatedAt != "2026-11-07T18:00:00Z" {
		t.Fatalf("updated = %q", v.UpdatedAt)
	}
	if v.Today.CacheRead != 300 || v.Today.Cost != 1.25 {
		t.Fatalf("usage = %+v", v.Today)
	}
	if len(v.Quotas) != 1 || v.Quotas[0].Windows[0].Remaining != 41 {
		t.Fatalf("quotas = %+v", v.Quotas)
	}
	if len(v.Active) != 1 || v.Active[0].Agent != "claude" {
		t.Fatalf("active = %+v", v.Active)
	}
	if v.Avatar.State != "waiting" || !v.Avatar.HasImage {
		t.Fatalf("avatar = %+v", v.Avatar)
	}
	if len(v.AvatarSets) != 1 || len(v.AvatarSets[0].States) != 1 {
		t.Fatalf("sets = %+v", v.AvatarSets)
	}
	if _, ok := round["config"]; !ok {
		t.Fatal("config missing from JSON")
	}
}

func TestStateViewEmptySlicesAreArrays(t *testing.T) {
	v := stateView(panel.Snapshot{}, ConfigView{})
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var round struct {
		Quotas     []any `json:"quotas"`
		Requests   []any `json:"requests"`
		Active     []any `json:"active"`
		AvatarSets []any `json:"avatarSets"`
		Today      struct {
			Series []any `json:"series"`
		} `json:"today"`
	}
	if err := json.Unmarshal(b, &round); err != nil {
		t.Fatal(err)
	}
	if round.Quotas == nil || round.Requests == nil || round.Active == nil || round.AvatarSets == nil || round.Today.Series == nil {
		t.Fatalf("nil arrays in JSON: %s", b)
	}
}
