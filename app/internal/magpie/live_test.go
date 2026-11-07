package magpie

import (
	"context"
	"os"
	"testing"
	"time"
)

// TestLiveGateway talks to the Magpie running on this machine when
// MAGPIE_LIVE=1. It never sends a model request, so it costs nothing.
func TestLiveGateway(t *testing.T) {
	if os.Getenv("MAGPIE_LIVE") == "" {
		t.Skip("set MAGPIE_LIVE=1 to run against a running magpie")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	client, hello, err := Discover(ctx, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("magpie %s on port %d", hello.Version, client.Port)

	quotas, err := client.Quotas(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("%d quotas", len(quotas))

	for _, period := range []string{"today", "7d", "30d"} {
		u, err := client.Usage(ctx, period)
		if err != nil {
			t.Fatal(err)
		}
		if u.Period != period {
			t.Fatalf("asked %s, got %s", period, u.Period)
		}
		t.Logf("%s: %d calls, %.2f cost, %d buckets", period, u.Calls, u.Cost, len(u.Series))
	}

	snap, err := client.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("snapshot: %d active, cursor %s", snap.Active, snap.Cursor)

	// Read the feed for a moment without triggering a model call; it may
	// be empty, which is fine. The point is that the stream opens and ends
	// cleanly on cancellation.
	sctx, scancel := context.WithTimeout(ctx, 2*time.Second)
	defer scancel()
	err = client.Stream(sctx, snap.Cursor, func(Event) error { return nil })
	if err != nil && sctx.Err() == nil {
		t.Fatalf("stream: %v", err)
	}
}
