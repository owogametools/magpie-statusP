package main

import (
	"time"

	"app/internal/magpie"
	"app/internal/panel"
)

// The types in this file are the shapes the frontend sees. They are kept in
// package main so `mygo generate` can describe them without reaching into
// internal packages.

// BucketView is one day of a usage series.
type BucketView struct {
	Label     string  `json:"label"`
	Time      string  `json:"time"`
	Calls     int64   `json:"calls"`
	Errors    int64   `json:"errors"`
	Input     int64   `json:"input"`
	Output    int64   `json:"output"`
	CacheRead int64   `json:"cacheRead"`
	Reasoning int64   `json:"reasoning"`
	Cost      float64 `json:"cost"`
}

// UsageView is one period's usage.
type UsageView struct {
	Period    string       `json:"period"`
	Since     string       `json:"since"`
	Calls     int64        `json:"calls"`
	Errors    int64        `json:"errors"`
	Retried   int64        `json:"retried"`
	Input     int64        `json:"input"`
	Output    int64        `json:"output"`
	CacheRead int64        `json:"cacheRead"`
	Reasoning int64        `json:"reasoning"`
	Cost      float64      `json:"cost"`
	Unpriced  int64        `json:"unpriced"`
	Series    []BucketView `json:"series"`
}

// QuotaWindowView is one limit of a subscription.
type QuotaWindowView struct {
	Name      string  `json:"name"`
	Used      float64 `json:"used"`
	Remaining float64 `json:"remaining"`
	ResetsAt  string  `json:"resetsAt"`
	Display   string  `json:"display"`
}

// QuotaView is one subscription's allowance.
type QuotaView struct {
	Provider string            `json:"provider"`
	Name     string            `json:"name"`
	Kind     string            `json:"kind"`
	Plan     string            `json:"plan"`
	Error    string            `json:"error"`
	Windows  []QuotaWindowView `json:"windows"`
}

// RequestView is a row of the gateway's request log.
type RequestView struct {
	Time      string `json:"time"`
	Agent     string `json:"agent"`
	Provider  string `json:"provider"`
	Model     string `json:"model"`
	Requested string `json:"requested"`
	Served    string `json:"served"`
	In        int64  `json:"in"`
	Out       int64  `json:"out"`
	CacheRead int64  `json:"cacheRead"`
	Reasoning int64  `json:"reasoning"`
	Effort    string `json:"effort"`
	Ms        int64  `json:"ms"`
	TTFT      int64  `json:"ttft"`
	Status    int    `json:"status"`
}

// RouteView is a request going on now.
type RouteView struct {
	ID       string `json:"id"`
	Time     string `json:"time"`
	Agent    string `json:"agent"`
	Provider string `json:"provider"`
	Model    string `json:"model"`
	Attempt  int    `json:"attempt"`
	Fallback bool   `json:"fallback"`
	Phase    string `json:"phase"`
	Status   int    `json:"status"`
	Failed   bool   `json:"failed"`
	Ms       int64  `json:"ms"`
	TTFT     int64  `json:"ttft"`
}

// AvatarNowView is the image the avatar tab shows now.
type AvatarNowView struct {
	Agent    string `json:"agent"`
	State    string `json:"state"`
	URL      string `json:"url"`
	Set      string `json:"set"`
	Own      bool   `json:"own"`
	HasImage bool   `json:"hasImage"`
}

// AvatarStateView is one state's images for one agent.
type AvatarStateView struct {
	State    string `json:"state"`
	OwnURL   string `json:"ownUrl"`
	URL      string `json:"url"`
	Set      string `json:"set"`
	Own      bool   `json:"own"`
	HasImage bool   `json:"hasImage"`
}

// AvatarSetView is one agent's seven states.
type AvatarSetView struct {
	Agent  string            `json:"agent"`
	States []AvatarStateView `json:"states"`
}

// ConfigView is the settings tab's copy of config.json, plus what was
// detected at runtime.
type ConfigView struct {
	Port           int      `json:"port"`
	BinaryPath     string   `json:"binaryPath"`
	DetectedBinary string   `json:"detectedBinary"`
	AlwaysOnTop    bool     `json:"alwaysOnTop"`
	Hotkey         string   `json:"hotkey"`
	Autostart      bool     `json:"autostart"`
	Theme          string   `json:"theme"`
	Language       string   `json:"language"`
	DefaultSet     string   `json:"defaultSet"`
	AgentOrder     []string `json:"agentOrder"`
	Width          int      `json:"width"`
	Height         int      `json:"height"`
	Version        string   `json:"version"`
	DataDir        string   `json:"dataDir"`
	AvatarDir      string   `json:"avatarDir"`
	HotkeyError    string   `json:"hotkeyError"`
	AutostartError string   `json:"autostartError"`
}

// StateView is everything the page paints.
type StateView struct {
	Connected  bool            `json:"connected"`
	Version    string          `json:"version"`
	Port       int             `json:"port"`
	Error      string          `json:"error"`
	UpdatedAt  string          `json:"updatedAt"`
	Today      UsageView       `json:"today"`
	Week       UsageView       `json:"week"`
	Month      UsageView       `json:"month"`
	Quotas     []QuotaView     `json:"quotas"`
	Requests   []RequestView   `json:"requests"`
	Active     []RouteView     `json:"active"`
	Avatar     AvatarNowView   `json:"avatar"`
	AvatarSets []AvatarSetView `json:"avatarSets"`
	DefaultSet string          `json:"defaultSet"`
	AgentOrder []string        `json:"agentOrder"`
	Config     ConfigView      `json:"config"`
}

// AgentView is one detected agent.
type AgentView struct {
	Name        string   `json:"name"`
	Key         string   `json:"key"`
	Model       string   `json:"model"`
	Details     []string `json:"details"`
	Fields      []string `json:"fields"`
	Effort      string   `json:"effort"`
	EffortField string   `json:"effortField"`
	Path        string   `json:"path"`
}

// ModelOptionView is one model an agent can pick.
type ModelOptionView struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Levels []string `json:"levels"`
}

// AvatarResult is what a file pick changed.
type AvatarResult struct {
	URL   string `json:"url"`
	Agent string `json:"agent"`
	State string `json:"state"`
	Set   string `json:"set"`
}

// ConfigPatch changes only the fields it sets.
type ConfigPatch struct {
	Port        *int     `json:"port,omitempty"`
	BinaryPath  *string  `json:"binaryPath,omitempty"`
	AlwaysOnTop *bool    `json:"alwaysOnTop,omitempty"`
	Hotkey      *string  `json:"hotkey,omitempty"`
	Autostart   *bool    `json:"autostart,omitempty"`
	Theme       *string  `json:"theme,omitempty"`
	Language    *string  `json:"language,omitempty"`
	DefaultSet  *string  `json:"defaultSet,omitempty"`
	AgentOrder  []string `json:"agentOrder,omitempty"`
}

func usageView(u magpie.Usage) UsageView {
	out := UsageView{
		Period: u.Period, Since: u.Since,
		Calls: u.Calls, Errors: u.Errors, Retried: u.Retried,
		Input: u.Input, Output: u.Output, CacheRead: u.CacheRead,
		Reasoning: u.Reasoning, Cost: u.Cost, Unpriced: u.Unpriced,
		Series: []BucketView{},
	}
	for _, b := range u.Series {
		out.Series = append(out.Series, BucketView{
			Label: b.Label, Time: b.Time, Calls: b.Calls, Errors: b.Errors,
			Input: b.Input, Output: b.Output, CacheRead: b.CacheRead,
			Reasoning: b.Reasoning, Cost: b.Cost,
		})
	}
	return out
}

func stateView(s panel.Snapshot, cfg ConfigView) StateView {
	out := StateView{
		Connected: s.Connected, Version: s.Version, Port: s.Port,
		Error: s.Error, Config: cfg,
		Today: usageView(s.Today), Week: usageView(s.Week),
		Month:  usageView(s.Month),
		Quotas: []QuotaView{}, Requests: []RequestView{}, Active: []RouteView{},
		Avatar: AvatarNowView{
			Agent: s.Avatar.Agent, State: s.Avatar.State, URL: s.Avatar.URL,
			Set: s.Avatar.Set, Own: s.Avatar.Own, HasImage: s.Avatar.HasImage,
		},
		AvatarSets: []AvatarSetView{}, DefaultSet: s.DefaultSet,
		AgentOrder: append([]string(nil), s.AgentOrder...),
	}
	if !s.UpdatedAt.IsZero() {
		out.UpdatedAt = s.UpdatedAt.Format(time.RFC3339)
	}
	for _, q := range s.Quotas {
		qv := QuotaView{Provider: q.Provider, Name: q.Name, Kind: q.Kind, Plan: q.Plan, Error: q.Error, Windows: []QuotaWindowView{}}
		for _, w := range q.Windows {
			qv.Windows = append(qv.Windows, QuotaWindowView{Name: w.Name, Used: w.Used, Remaining: w.Remaining, ResetsAt: w.ResetsAt, Display: w.Display})
		}
		out.Quotas = append(out.Quotas, qv)
	}
	for _, r := range s.Requests {
		out.Requests = append(out.Requests, RequestView{
			Time: r.Time, Agent: r.Agent, Provider: r.Provider, Model: r.Model,
			Requested: r.Requested, Served: r.Served, In: r.In, Out: r.Out,
			CacheRead: r.CacheRead, Reasoning: r.Reasoning, Effort: r.Effort,
			Ms: r.Ms, TTFT: r.TTFT, Status: r.Status,
		})
	}
	for _, r := range s.Active {
		out.Active = append(out.Active, RouteView{
			ID: r.ID, Time: r.Time, Agent: r.Agent, Provider: r.Provider,
			Model: r.Model, Attempt: r.Attempt, Fallback: r.Fallback,
			Phase: r.Phase, Status: r.Status, Failed: r.Failed, Ms: r.Ms, TTFT: r.TTFT,
		})
	}
	for _, set := range s.AvatarSets {
		av := AvatarSetView{Agent: set.Agent, States: []AvatarStateView{}}
		for _, st := range set.States {
			av.States = append(av.States, AvatarStateView{
				State: st.State, OwnURL: st.OwnURL, URL: st.URL, Set: st.Set,
				Own: st.Own, HasImage: st.HasImage,
			})
		}
		out.AvatarSets = append(out.AvatarSets, av)
	}
	return out
}
