// Package panel keeps the data the floating panel shows: Magpie's usage,
// quotas and request log, its live routing feed, and the avatar state those
// routes put the panel in. It polls, reconnects and degrades to offline
// without taking the UI down.
package panel

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"app/internal/avatar"
	"app/internal/magpie"
	"app/internal/settings"
)

// Avatar states.
const (
	StateOffline   = "offline"
	StateIdle      = "idle"
	StateRouting   = "routing"
	StateWaiting   = "waiting"
	StateStreaming = "streaming"
	StateFallback  = "fallback"
	StateFailed    = "failed"
)

const (
	// failedShow and fallbackShow are how long the avatar holds those states
	// after the event that caused them.
	failedShow   = 3 * time.Second
	fallbackShow = 2 * time.Second
	// pollEvery is the quota and usage refresh period.
	pollEvery = 15 * time.Second
)

// AvatarNow is the image the avatar tab should show.
type AvatarNow struct {
	Agent    string `json:"agent"`
	State    string `json:"state"`
	URL      string `json:"url"`
	Set      string `json:"set"`
	Own      bool   `json:"own"`
	HasImage bool   `json:"hasImage"`
}

// AvatarState is one state's images for one agent.
type AvatarState struct {
	State    string `json:"state"`
	OwnURL   string `json:"ownUrl"`
	URL      string `json:"url"`
	Set      string `json:"set"`
	Own      bool   `json:"own"`
	HasImage bool   `json:"hasImage"`
}

// AvatarSet is one agent's seven states.
type AvatarSet struct {
	Agent  string        `json:"agent"`
	States []AvatarState `json:"states"`
}

// Snapshot is everything the page paints.
type Snapshot struct {
	Connected  bool             `json:"connected"`
	Version    string           `json:"version"`
	Port       int              `json:"port"`
	Error      string           `json:"error,omitempty"`
	UpdatedAt  time.Time        `json:"updatedAt"`
	Today      magpie.Usage     `json:"today"`
	Week       magpie.Usage     `json:"week"`
	Month      magpie.Usage     `json:"month"`
	Quotas     []magpie.Quota   `json:"quotas"`
	Requests   []magpie.Request `json:"requests"`
	Active     []magpie.Route   `json:"active"`
	Avatar     AvatarNow        `json:"avatar"`
	AvatarSets []AvatarSet      `json:"avatarSets"`
	DefaultSet string           `json:"defaultSet"`
	AgentOrder []string         `json:"agentOrder"`
}

// Hub owns the state and the goroutines that keep it fresh.
type Hub struct {
	store *settings.Store
	av    *avatar.Resolver

	mu        sync.Mutex
	connected bool
	version   string
	port      int
	lastErr   string
	updated   time.Time

	today, week, month magpie.Usage
	quotas             []magpie.Quota
	requests           []magpie.Request
	routes             map[string]magpie.Route
	lastAgent          string
	lastSeen           map[string]time.Time
	failedAt           map[string]time.Time
	fallbackAt         map[string]time.Time

	subMu     sync.Mutex
	subs      map[int]func(Snapshot)
	nextID    int
	refresh   chan struct{}
	reconnect chan struct{}
}

// New returns an offline hub.
func New(store *settings.Store, av *avatar.Resolver) *Hub {
	return &Hub{
		store:      store,
		av:         av,
		routes:     map[string]magpie.Route{},
		lastSeen:   map[string]time.Time{},
		failedAt:   map[string]time.Time{},
		fallbackAt: map[string]time.Time{},
		subs:       map[int]func(Snapshot){},
		refresh:    make(chan struct{}, 1),
		reconnect:  make(chan struct{}, 1),
	}
}

// Subscribe registers fn for state changes and returns an unsubscribe.
func (h *Hub) Subscribe(fn func(Snapshot)) func() {
	h.subMu.Lock()
	defer h.subMu.Unlock()
	id := h.nextID
	h.nextID++
	h.subs[id] = fn
	return func() {
		h.subMu.Lock()
		delete(h.subs, id)
		h.subMu.Unlock()
	}
}

// Refresh asks for an immediate quota and usage poll.
func (h *Hub) Refresh() {
	select {
	case h.refresh <- struct{}{}:
	default:
	}
}

// Notify republishes the current state, after a config or avatar change.
func (h *Hub) Notify() { h.publish() }

// Reconnect drops the current connection so the next discovery uses a new
// port or binary.
func (h *Hub) Reconnect() {
	select {
	case h.reconnect <- struct{}{}:
	default:
	}
}

var errReconnect = errors.New("reconnect")

// Snapshot returns the current state.
func (h *Hub) Snapshot() Snapshot {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.snapshotLocked()
}

func (h *Hub) snapshotLocked() Snapshot {
	cfg := h.av.Config()
	s := Snapshot{
		Connected:  h.connected,
		Version:    h.version,
		Port:       h.port,
		Error:      h.lastErr,
		UpdatedAt:  h.updated,
		Today:      h.today,
		Week:       h.week,
		Month:      h.month,
		Quotas:     append([]magpie.Quota(nil), h.quotas...),
		Requests:   append([]magpie.Request(nil), h.requests...),
		DefaultSet: cfg.DefaultSet,
		AgentOrder: append([]string(nil), cfg.AgentOrder...),
	}
	if s.Quotas == nil {
		s.Quotas = []magpie.Quota{}
	}
	if s.Requests == nil {
		s.Requests = []magpie.Request{}
	}
	for _, r := range h.routes {
		s.Active = append(s.Active, r)
	}
	sort.Slice(s.Active, func(i, j int) bool { return s.Active[i].Time < s.Active[j].Time })
	s.Avatar = h.avatarLocked(cfg)
	s.AvatarSets = h.catalogLocked(cfg)
	return s
}

// avatarLocked decides the one agent and state the avatar shows. Callers
// hold h.mu.
func (h *Hub) avatarLocked(cfg settings.Avatar) AvatarNow {
	agent, state := h.pickLocked(cfg)
	url, set, own, ok := h.av.Resolve(agent, state)
	return AvatarNow{Agent: agent, State: state, URL: url, Set: set, Own: own, HasImage: ok}
}

func (h *Hub) pickLocked(cfg settings.Avatar) (string, string) {
	if !h.connected {
		agent := h.lastAgent
		if agent == "" {
			agent = cfg.DefaultSet
		}
		return agent, StateOffline
	}
	agent := h.pickActive(cfg.AgentOrder)
	active := agent != ""
	if !active {
		agent = h.lastAgent
		if agent == "" {
			agent = cfg.DefaultSet
		}
	}
	// A failure or a fallback stays on screen briefly even after its route
	// leaves the active set.
	if t, ok := h.failedAt[agent]; ok && time.Since(t) < failedShow {
		return agent, StateFailed
	}
	if t, ok := h.fallbackAt[agent]; ok && time.Since(t) < fallbackShow {
		return agent, StateFallback
	}
	if !active {
		return agent, StateIdle
	}
	if r := h.latestRoute(agent); r != nil {
		switch {
		case r.Phase == "responding" || r.TTFT > 0:
			return agent, StateStreaming
		case r.Phase == "attempt":
			return agent, StateWaiting
		default:
			return agent, StateRouting
		}
	}
	return agent, StateIdle
}

// pickActive returns the highest-priority agent with a request going.
func (h *Hub) pickActive(order []string) string {
	rank := map[string]int{}
	for i, a := range order {
		rank[settings.Key(a)] = i
	}
	best := ""
	bestRank := 1 << 30
	var bestSeen time.Time
	for _, r := range h.routes {
		agent := settings.Key(r.Agent)
		if agent == "" {
			continue
		}
		rk, known := rank[agent]
		if !known {
			rk = len(order)
		}
		seen := h.lastSeen[agent]
		if best == "" || rk < bestRank || (rk == bestRank && seen.After(bestSeen)) {
			best, bestRank, bestSeen = agent, rk, seen
		}
	}
	return best
}

func (h *Hub) latestRoute(agent string) *magpie.Route {
	var out *magpie.Route
	for _, r := range h.routes {
		if settings.Key(r.Agent) != agent {
			continue
		}
		cp := r
		if out == nil || cp.Time > out.Time {
			out = &cp
		}
	}
	return out
}

// catalogLocked lists every agent's seven states for the avatar editor.
func (h *Hub) catalogLocked(cfg settings.Avatar) []AvatarSet {
	seen := map[string]bool{}
	var agents []string
	add := func(a string) {
		a = settings.Key(a)
		if a == "" || seen[a] {
			return
		}
		seen[a] = true
		agents = append(agents, a)
	}
	for _, a := range cfg.AgentOrder {
		add(a)
	}
	for a := range cfg.Sets {
		add(a)
	}
	for a := range h.lastSeen {
		add(a)
	}
	out := make([]AvatarSet, 0, len(agents))
	for _, a := range agents {
		row := AvatarSet{Agent: a}
		for _, st := range settings.AvatarStates {
			ownURL, _ := h.av.SetFile(a, st)
			url, set, own, ok := h.av.Resolve(a, st)
			row.States = append(row.States, AvatarState{
				State: st, OwnURL: ownURL, URL: url, Set: set, Own: own, HasImage: ok,
			})
		}
		out = append(out, row)
	}
	return out
}

func (h *Hub) publish() {
	s := h.Snapshot()
	h.subMu.Lock()
	fns := make([]func(Snapshot), 0, len(h.subs))
	for _, fn := range h.subs {
		fns = append(fns, fn)
	}
	h.subMu.Unlock()
	for _, fn := range fns {
		fn(s)
	}
}

func (h *Hub) setOffline(err error) {
	h.mu.Lock()
	h.connected = false
	h.port = 0
	if err != nil {
		h.lastErr = err.Error()
	}
	h.updated = time.Now()
	h.routes = map[string]magpie.Route{}
	h.mu.Unlock()
	h.publish()
}

func (h *Hub) setOnline(hello magpie.Hello, port int) {
	h.mu.Lock()
	h.connected = true
	h.version = hello.Version
	h.port = port
	h.lastErr = ""
	h.updated = time.Now()
	h.mu.Unlock()
	h.publish()
}

// Run keeps the hub connected until ctx ends.
func (h *Hub) Run(ctx context.Context) {
	backoff := 2 * time.Second
	for ctx.Err() == nil {
		client, hello, err := magpie.Discover(ctx, h.store.Get().Magpie.Port)
		if err != nil {
			h.setOffline(err)
			if !pause(ctx, backoff) {
				return
			}
			if backoff < 30*time.Second {
				backoff *= 2
				if backoff > 30*time.Second {
					backoff = 30 * time.Second
				}
			}
			continue
		}
		backoff = 2 * time.Second
		h.setOnline(hello, client.Port)

		runCtx, cancel := context.WithCancel(ctx)
		go h.streamLoop(runCtx, client)
		err = h.pollLoop(runCtx, client)
		cancel()
		if ctx.Err() != nil {
			return
		}
		if err != nil && !errors.Is(err, errReconnect) {
			h.setOffline(err)
		}
		if !pause(ctx, 2*time.Second) {
			return
		}
	}
}

func (h *Hub) pollLoop(ctx context.Context, client *magpie.Client) error {
	if err := h.poll(ctx, client); err != nil {
		return err
	}
	ticker := time.NewTicker(pollEvery)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := h.poll(ctx, client); err != nil {
				return err
			}
		case <-h.refresh:
			if err := h.poll(ctx, client); err != nil {
				return err
			}
		case <-h.reconnect:
			return errReconnect
		}
	}
}

func (h *Hub) poll(ctx context.Context, client *magpie.Client) error {
	hello, err := client.Hello(ctx)
	if err != nil {
		return err
	}
	var (
		wg       sync.WaitGroup
		mu       sync.Mutex
		firstErr error
		quotas   []magpie.Quota
		today    magpie.Usage
		week     magpie.Usage
		month    magpie.Usage
		requests []magpie.Request
	)
	run := func(fn func() error) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := fn(); err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = err
				}
				mu.Unlock()
			}
		}()
	}
	run(func() (err error) { quotas, err = client.Quotas(ctx); return })
	run(func() (err error) { today, err = client.Usage(ctx, "today"); return })
	run(func() (err error) { week, err = client.Usage(ctx, "7d"); return })
	run(func() (err error) { month, err = client.Usage(ctx, "30d"); return })
	wg.Add(1)
	go func() {
		defer wg.Done()
		// The request log is nice to have: its failure must not mark the
		// whole panel offline.
		requests, _ = client.Requests(ctx, 8)
	}()
	wg.Wait()
	if firstErr != nil {
		return firstErr
	}

	h.mu.Lock()
	h.connected = true
	h.version = hello.Version
	h.port = client.Port
	h.lastErr = ""
	h.updated = time.Now()
	h.quotas = quotas
	h.today, h.week, h.month = today, week, month
	h.requests = requests
	h.mu.Unlock()
	h.publish()
	return nil
}

// streamLoop keeps the route feed open, taking a snapshot whenever the
// cursor or the connection is lost.
func (h *Hub) streamLoop(ctx context.Context, client *magpie.Client) {
	pauseFor := time.Second
	for ctx.Err() == nil {
		snap, err := client.Snapshot(ctx)
		if err != nil {
			if !pause(ctx, pauseFor) {
				return
			}
			if pauseFor < 10*time.Second {
				pauseFor *= 2
			}
			continue
		}
		pauseFor = time.Second
		h.seed(snap)
		err = client.Stream(ctx, snap.Cursor, h.apply)
		if ctx.Err() != nil {
			return
		}
		if errors.Is(err, magpie.ErrSnapshotRequired) {
			continue
		}
		if !pause(ctx, time.Second) {
			return
		}
	}
}

func (h *Hub) seed(snap magpie.Snapshot) {
	h.mu.Lock()
	next := make(map[string]magpie.Route, len(snap.Routes))
	for _, r := range snap.Routes {
		next[r.ID] = r
		if r.Agent != "" {
			h.lastAgent = settings.Key(r.Agent)
			h.lastSeen[h.lastAgent] = time.Now()
		}
	}
	h.routes = next
	h.mu.Unlock()
	h.publish()
}

func (h *Hub) apply(ev magpie.Event) error {
	r := ev.Route
	agent := settings.Key(r.Agent)
	now := time.Now()
	h.mu.Lock()
	if r.ID != "" {
		if ev.Kind == "request_finished" || ev.Kind == "request_dropped" || r.Phase == "done" || r.Phase == "dropped" {
			delete(h.routes, r.ID)
		} else {
			h.routes[r.ID] = r
		}
	}
	if agent != "" {
		h.lastAgent = agent
		h.lastSeen[agent] = now
		if r.Fallback {
			h.fallbackAt[agent] = now
		}
		if r.Failed || r.Status >= 400 {
			h.failedAt[agent] = now
		}
	}
	h.updated = now
	h.mu.Unlock()
	h.publish()
	if agent != "" {
		if r.Failed || r.Status >= 400 {
			time.AfterFunc(failedShow, h.publish)
		}
		if r.Fallback {
			time.AfterFunc(fallbackShow, h.publish)
		}
	}
	return nil
}

// Connected reports whether the last poll reached Magpie.
func (h *Hub) Connected() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.connected
}

func pause(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

// StateLabel is the English label of a state, for logs and the CLI.
func StateLabel(state string) string {
	switch state {
	case StateOffline:
		return "offline"
	case StateIdle:
		return "idle"
	case StateRouting:
		return "routing"
	case StateWaiting:
		return "waiting for first token"
	case StateStreaming:
		return "streaming"
	case StateFallback:
		return "fallback"
	case StateFailed:
		return "failed"
	}
	return strings.TrimSpace(state)
}
