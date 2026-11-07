package panel

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"app/internal/avatar"
	"app/internal/magpie"
	"app/internal/settings"
)

func testHub(t *testing.T) (*Hub, *avatar.Resolver) {
	t.Helper()
	dir := t.TempDir()
	store, err := settings.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	av := avatar.New(filepath.Join(dir, "avatars"))
	av.SetConfig(settings.Avatar{
		DefaultSet: "claude",
		AgentOrder: []string{"claude", "codex"},
		Sets:       map[string]map[string]string{},
	})
	h := New(store, av)
	h.connected = true
	return h, av
}

func addRoute(h *Hub, r magpie.Route) {
	h.routes[r.ID] = r
	h.lastSeen[settings.Key(r.Agent)] = time.Now()
	h.lastAgent = settings.Key(r.Agent)
}

func TestAvatarPicksHighestPriorityActiveAgent(t *testing.T) {
	h, _ := testHub(t)
	addRoute(h, magpie.Route{ID: "a", Agent: "codex", Phase: "responding", TTFT: 100, Time: "2026-11-07T18:00:01Z"})
	addRoute(h, magpie.Route{ID: "b", Agent: "claude", Phase: "attempt", Time: "2026-11-07T18:00:02Z"})
	got := h.avatarLocked(h.av.Config())
	if got.Agent != "claude" || got.State != StateWaiting {
		t.Fatalf("avatar = %+v", got)
	}
}

func TestAvatarStates(t *testing.T) {
	h, av := testHub(t)
	addRoute(h, magpie.Route{ID: "a", Agent: "claude", Phase: "attempt", TTFT: 42, Time: "2026-11-07T18:00:01Z"})
	if got := h.avatarLocked(av.Config()); got.State != StateStreaming {
		t.Fatalf("streaming: %+v", got)
	}
	h.routes["a"] = magpie.Route{ID: "a", Agent: "claude", Phase: "started", Time: "2026-11-07T18:00:01Z"}
	if got := h.avatarLocked(av.Config()); got.State != StateRouting {
		t.Fatalf("routing: %+v", got)
	}
}

func TestAvatarFailedThenIdle(t *testing.T) {
	h, av := testHub(t)
	addRoute(h, magpie.Route{ID: "a", Agent: "claude", Phase: "done", Failed: true, Time: "2026-11-07T18:00:01Z"})
	delete(h.routes, "a")
	h.failedAt["claude"] = time.Now()
	if got := h.avatarLocked(av.Config()); got.State != StateFailed {
		t.Fatalf("failed: %+v", got)
	}
	h.failedAt["claude"] = time.Now().Add(-failedShow)
	if got := h.avatarLocked(av.Config()); got.State != StateIdle || got.Agent != "claude" {
		t.Fatalf("idle after failure: %+v", got)
	}
}

func TestAvatarFallbackBeatsWaiting(t *testing.T) {
	h, av := testHub(t)
	addRoute(h, magpie.Route{ID: "a", Agent: "claude", Phase: "attempt", Attempt: 2, Fallback: true, Time: "2026-11-07T18:00:01Z"})
	h.fallbackAt["claude"] = time.Now()
	if got := h.avatarLocked(av.Config()); got.State != StateFallback {
		t.Fatalf("fallback: %+v", got)
	}
}

func TestAvatarIdleUsesLastActiveAgent(t *testing.T) {
	h, av := testHub(t)
	h.lastAgent = "codex"
	if got := h.avatarLocked(av.Config()); got.Agent != "codex" || got.State != StateIdle {
		t.Fatalf("idle: %+v", got)
	}
	h.connected = false
	if got := h.avatarLocked(av.Config()); got.State != StateOffline {
		t.Fatalf("offline: %+v", got)
	}
}

func TestApplyUpdatesRoutesAndNotifies(t *testing.T) {
	h, _ := testHub(t)
	got := make(chan Snapshot, 1)
	h.Subscribe(func(s Snapshot) {
		select {
		case got <- s:
		default:
		}
	})
	if err := h.apply(magpie.Event{Kind: "attempt_started", Route: magpie.Route{
		ID: "r1", Agent: "claude", Phase: "attempt", Attempt: 1, Time: time.Now().Format(time.RFC3339),
	}}); err != nil {
		t.Fatal(err)
	}
	select {
	case s := <-got:
		if len(s.Active) != 1 || s.Avatar.Agent != "claude" {
			t.Fatalf("snapshot = %+v", s)
		}
	case <-time.After(time.Second):
		t.Fatal("no state published")
	}
	if err := h.apply(magpie.Event{Kind: "request_finished", Route: magpie.Route{
		ID: "r1", Agent: "claude", Phase: "done", Status: 200,
	}}); err != nil {
		t.Fatal(err)
	}
	if len(h.Snapshot().Active) != 0 {
		t.Fatal("finished route still active")
	}
}

func TestCatalogResolvesDefaultSet(t *testing.T) {
	h, av := testHub(t)
	dir := t.TempDir()
	src := filepath.Join(dir, "idle.png")
	if err := os.WriteFile(src, []byte("PNG"), 0o600); err != nil {
		t.Fatal(err)
	}
	rel, err := av.Save("claude", "idle", src)
	if err != nil {
		t.Fatal(err)
	}
	av.SetConfig(settings.Avatar{
		DefaultSet: "claude", AgentOrder: []string{"claude", "codex"},
		Sets: map[string]map[string]string{"claude": {"idle": rel}},
	})
	sets := h.catalogLocked(av.Config())
	if len(sets) != 2 {
		t.Fatalf("sets = %+v", sets)
	}
	for _, set := range sets {
		if set.Agent != "codex" {
			continue
		}
		for _, st := range set.States {
			if st.State != "idle" {
				continue
			}
			if !st.HasImage || st.Own || st.Set != "claude" || st.URL == "" {
				t.Fatalf("codex idle = %+v", st)
			}
			if st.OwnURL != "" {
				t.Fatalf("codex own url = %q", st.OwnURL)
			}
			return
		}
	}
	t.Fatal("codex idle state missing")
}
