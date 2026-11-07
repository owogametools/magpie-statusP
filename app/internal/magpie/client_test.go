package magpie

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func testClient(t *testing.T, h http.Handler) *Client {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	u, err := url.Parse(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil {
		t.Fatal(err)
	}
	c := New(port)
	c.HTTP = srv.Client()
	return c
}

func TestHelloQuotasUsage(t *testing.T) {
	c := testClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/hello":
			fmt.Fprint(w, `{"name":"magpie","version":"1.2.3"}`)
		case "/v1/magpie/quotas":
			fmt.Fprint(w, `{"data":[{"provider":"grok","name":"Grok","kind":"subscription","windows":[{"name":"7 days","used":59,"remaining":41,"resetsAt":"2026-11-08T09:58:11.899Z"}]}]}`)
		case "/v1/magpie/usage":
			fmt.Fprintf(w, `{"period":%q,"calls":3,"errors":1,"cost":1.5,"series":[{"label":"Nov 7","calls":3}]}`, r.URL.Query().Get("period"))
		case "/v1/magpie/usage/requests":
			fmt.Fprint(w, `{"rows":[{"t":"2026-11-07T18:00:02+09:00","agent":"claude","model":"x","ms":12,"status":200}]}`)
		default:
			http.NotFound(w, r)
		}
	}))
	ctx := context.Background()
	hello, err := c.Hello(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if hello.Name != "magpie" || hello.Version != "1.2.3" {
		t.Fatalf("hello = %+v", hello)
	}
	quotas, err := c.Quotas(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(quotas) != 1 || quotas[0].Windows[0].Remaining != 41 {
		t.Fatalf("quotas = %+v", quotas)
	}
	usage, err := c.Usage(ctx, "7d")
	if err != nil {
		t.Fatal(err)
	}
	if usage.Period != "7d" || len(usage.Series) != 1 {
		t.Fatalf("usage = %+v", usage)
	}
	rows, err := c.Requests(ctx, 8)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Agent != "claude" {
		t.Fatalf("rows = %+v", rows)
	}
}

func TestHelloRejectsOtherServer(t *testing.T) {
	c := testClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"name":"something-else"}`)
	}))
	if _, err := c.Hello(context.Background()); err == nil {
		t.Fatal("accepted a non-magpie server")
	}
}

func TestStreamParsesEvents(t *testing.T) {
	c := testClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("after") != "abc:1" {
			t.Errorf("after = %q", r.URL.Query().Get("after"))
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "id: abc:2\nevent: route\ndata: {\"cursor\":\"abc:2\",\"kind\":\"attempt_started\",\"active\":1,\"route\":{\"id\":\"r1\",\"agent\":\"claude\",\"phase\":\"attempt\",\"attempt\":1}}\n\n")
		fmt.Fprint(w, "event: heartbeat\ndata: {}\n\n")
		fmt.Fprint(w, "id: abc:3\nevent: route\ndata: {\"cursor\":\"abc:3\",\"kind\":\"request_finished\",\"active\":0,\"route\":{\"id\":\"r1\",\"agent\":\"claude\",\"phase\":\"done\",\"status\":200}}\n\n")
	}))
	var events []Event
	_ = c.Stream(context.Background(), "abc:1", func(ev Event) error {
		events = append(events, ev)
		return nil
	})
	if len(events) != 2 {
		t.Fatalf("events = %d: %+v", len(events), events)
	}
	if events[0].Kind != "attempt_started" || events[1].Route.Phase != "done" {
		t.Fatalf("unexpected events: %+v", events)
	}
}

func TestStreamExpiredCursor(t *testing.T) {
	c := testClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
		fmt.Fprint(w, `{"error":"snapshot_required"}`)
	}))
	err := c.Stream(context.Background(), "old:0", func(Event) error { return nil })
	if !errors.Is(err, ErrSnapshotRequired) {
		t.Fatalf("err = %v", err)
	}
}

func TestConfigPorts(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "magpie"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "magpie", "settings.json"), []byte(`{"port": 4555}`), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("XDG_CONFIG_HOME", dir)
	ports := configPorts()
	if len(ports) == 0 || ports[0] != 4555 {
		t.Fatalf("ports = %v", ports)
	}
}
