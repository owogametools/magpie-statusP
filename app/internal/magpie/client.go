// Package magpie is the only place that speaks to Magpie's local gateway.
// Every request is loopback-only and carries no key of the user's.
package magpie

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// DefaultPort is where Magpie's gateway listens unless settings.json says
// otherwise.
const DefaultPort = 3425

// ErrSnapshotRequired is returned by Stream when its cursor is no longer in
// the gateway's feed; take a fresh Snapshot and stream from that cursor.
var ErrSnapshotRequired = errors.New("magpie: route events cursor expired")

// Hello identifies the process on a port.
type Hello struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// Quota is one subscription's allowance.
type Quota struct {
	Provider string        `json:"provider"`
	Name     string        `json:"name"`
	Kind     string        `json:"kind"`
	Plan     string        `json:"plan,omitempty"`
	Windows  []QuotaWindow `json:"windows"`
	Error    string        `json:"error,omitempty"`
}

// QuotaWindow is one limit of a subscription.
type QuotaWindow struct {
	Name      string  `json:"name"`
	Used      float64 `json:"used"`
	Remaining float64 `json:"remaining"`
	ResetsAt  string  `json:"resetsAt"`
	Display   string  `json:"display,omitempty"`
}

// Usage is a period's totals and daily buckets.
type Usage struct {
	Period    string   `json:"period"`
	Since     string   `json:"since"`
	Calls     int64    `json:"calls"`
	Errors    int64    `json:"errors"`
	Retried   int64    `json:"retried"`
	Input     int64    `json:"input"`
	Output    int64    `json:"output"`
	CacheRead int64    `json:"cache_read"`
	Reasoning int64    `json:"reasoning"`
	Cost      float64  `json:"cost"`
	Unpriced  int64    `json:"unpriced"`
	Series    []Bucket `json:"series"`
}

// Bucket is one day of a usage series.
type Bucket struct {
	Label     string  `json:"label"`
	Time      string  `json:"time"`
	Calls     int64   `json:"calls"`
	Errors    int64   `json:"errors"`
	Input     int64   `json:"input"`
	Output    int64   `json:"output"`
	CacheRead int64   `json:"cache_read"`
	Reasoning int64   `json:"reasoning"`
	Cost      float64 `json:"cost"`
}

// Request is one row of the gateway's request log.
type Request struct {
	Time      string `json:"t"`
	Agent     string `json:"agent"`
	Provider  string `json:"provider"`
	Model     string `json:"model"`
	Requested string `json:"req"`
	Served    string `json:"served"`
	In        int64  `json:"in"`
	Out       int64  `json:"out"`
	CacheRead int64  `json:"cache_read"`
	Reasoning int64  `json:"reasoning"`
	Effort    string `json:"effort"`
	Ms        int64  `json:"ms"`
	TTFT      int64  `json:"ttft_ms"`
	Status    int    `json:"status"`
}

// Route is one request as the route-events feed tells it.
type Route struct {
	ID       string `json:"id"`
	Time     string `json:"time"`
	Agent    string `json:"agent"`
	Provider string `json:"provider,omitempty"`
	Model    string `json:"model,omitempty"`
	Attempt  int    `json:"attempt"`
	Fallback bool   `json:"fallback"`
	Phase    string `json:"phase"`
	Status   int    `json:"status,omitempty"`
	Failed   bool   `json:"failed,omitempty"`
	Ms       int64  `json:"ms,omitempty"`
	TTFT     int64  `json:"ttft_ms,omitempty"`
}

// Event is one change of a route.
type Event struct {
	Cursor string `json:"cursor"`
	Kind   string `json:"kind"`
	Active int    `json:"active"`
	Route  Route  `json:"route"`
}

// Snapshot is the feed's current state.
type Snapshot struct {
	Active int     `json:"active"`
	Cursor string  `json:"cursor"`
	Routes []Route `json:"routes"`
}

// Model is one entry of the gateway's catalog.
type Model struct {
	ID              string   `json:"id"`
	DisplayName     string   `json:"display_name"`
	OwnedBy         string   `json:"owned_by"`
	Reasoning       bool     `json:"reasoning"`
	ReasoningLevels []string `json:"reasoning_levels"`
	ContextWindow   int      `json:"context_window"`
	Kind            string   `json:"kind"`
}

// Client talks to one gateway port.
type Client struct {
	Port int
	HTTP *http.Client
}

// New returns a client for port with a conservative timeout. Streaming uses
// its own request so the timeout does not cut a quiet stream.
func New(port int) *Client {
	return &Client{Port: port, HTTP: &http.Client{Timeout: 6 * time.Second}}
}

func (c *Client) base() string { return "http://127.0.0.1:" + strconv.Itoa(c.Port) }

// Discover finds a running Magpie and returns a client for it plus its hello.
// It tries override first (when non-zero), then the port in Magpie's own
// settings.json, then DefaultPort.
func Discover(ctx context.Context, override int) (*Client, Hello, error) {
	var ports []int
	add := func(p int) {
		if p <= 0 || p > 65535 {
			return
		}
		for _, old := range ports {
			if old == p {
				return
			}
		}
		ports = append(ports, p)
	}
	add(override)
	for _, p := range configPorts() {
		add(p)
	}
	add(DefaultPort)

	var last error
	for _, port := range ports {
		c := New(port)
		hello, err := c.Hello(ctx)
		if err == nil {
			return c, hello, nil
		}
		last = err
	}
	if last == nil {
		last = errors.New("magpie is not reachable")
	}
	return nil, Hello{}, last
}

// configPorts reads the port from Magpie's settings.json, read-only. Magpie
// keeps that file at ~/.config/magpie/settings.json on every desktop system,
// with $XDG_CONFIG_HOME taking over when set.
func configPorts() []int {
	var paths []string
	home, _ := os.UserHomeDir()
	if x := strings.TrimSpace(os.Getenv("XDG_CONFIG_HOME")); x != "" {
		paths = append(paths, filepath.Join(x, "magpie", "settings.json"))
	}
	if home != "" {
		paths = append(paths, filepath.Join(home, ".config", "magpie", "settings.json"))
	}
	if dir, err := os.UserConfigDir(); err == nil {
		paths = append(paths, filepath.Join(dir, "magpie", "settings.json"))
	}
	var ports []int
	for _, p := range paths {
		raw, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		var cfg struct {
			Port json.RawMessage `json:"port"`
		}
		if json.Unmarshal(raw, &cfg) != nil || len(cfg.Port) == 0 {
			continue
		}
		var n int
		if json.Unmarshal(cfg.Port, &n) == nil {
			ports = append(ports, n)
			continue
		}
		var s string
		if json.Unmarshal(cfg.Port, &s) == nil {
			if n, err := strconv.Atoi(strings.TrimSpace(s)); err == nil {
				ports = append(ports, n)
			}
		}
	}
	return ports
}

// Hello asks the port to identify itself.
func (c *Client) Hello(ctx context.Context) (Hello, error) {
	var h Hello
	if err := c.get(ctx, "/api/hello", &h); err != nil {
		return Hello{}, err
	}
	if !strings.EqualFold(h.Name, "magpie") {
		return Hello{}, fmt.Errorf("port %d is not magpie", c.Port)
	}
	return h, nil
}

// Quotas lists subscription allowances.
func (c *Client) Quotas(ctx context.Context) ([]Quota, error) {
	var wrap struct {
		Data []Quota `json:"data"`
	}
	if err := c.get(ctx, "/v1/magpie/quotas", &wrap); err != nil {
		return nil, err
	}
	return wrap.Data, nil
}

// Usage returns totals for period: "today", "7d" or "30d".
func (c *Client) Usage(ctx context.Context, period string) (Usage, error) {
	var u Usage
	err := c.get(ctx, "/v1/magpie/usage?period="+url.QueryEscape(period), &u)
	return u, err
}

// Requests returns the most recent rows of the request log.
func (c *Client) Requests(ctx context.Context, limit int) ([]Request, error) {
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	var wrap struct {
		Rows []Request `json:"rows"`
	}
	if err := c.get(ctx, "/v1/magpie/usage/requests?limit="+strconv.Itoa(limit), &wrap); err != nil {
		return nil, err
	}
	return wrap.Rows, nil
}

// Models lists the gateway's catalog.
func (c *Client) Models(ctx context.Context) ([]Model, error) {
	var wrap struct {
		Data []Model `json:"data"`
	}
	if err := c.get(ctx, "/v1/models", &wrap); err != nil {
		return nil, err
	}
	return wrap.Data, nil
}

// Snapshot returns the requests going now and the feed cursor.
func (c *Client) Snapshot(ctx context.Context) (Snapshot, error) {
	var s Snapshot
	err := c.get(ctx, "/v1/magpie/route-events/snapshot", &s)
	return s, err
}

// Stream reads the route-events feed from cursor until ctx ends or the
// gateway closes it. fn is called for each route event, in order. A 409
// cursor replies ErrSnapshotRequired.
func (c *Client) Stream(ctx context.Context, cursor string, fn func(Event) error) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.base()+"/v1/magpie/route-events?after="+url.QueryEscape(cursor), nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Cache-Control", "no-cache")
	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusConflict {
		return ErrSnapshotRequired
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("route events: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}

	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 0, 64*1024), 1<<20)
	event := ""
	var data strings.Builder
	for sc.Scan() {
		line := sc.Text()
		switch {
		case line == "":
			if event == "route" && data.Len() > 0 {
				var ev Event
				if err := json.Unmarshal([]byte(data.String()), &ev); err != nil {
					return fmt.Errorf("route event: %w", err)
				}
				if err := fn(ev); err != nil {
					return err
				}
			}
			event = ""
			data.Reset()
		case strings.HasPrefix(line, "event:"):
			event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "data:"):
			if data.Len() > 0 {
				data.WriteByte('\n')
			}
			data.WriteString(strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}
	if err := sc.Err(); err != nil {
		return err
	}
	return io.EOF
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base()+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("magpie at %d: %w", c.Port, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("magpie %s: %s: %s", path, resp.Status, strings.TrimSpace(string(body)))
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("magpie %s: %w", path, err)
	}
	return nil
}
