package avatar

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"app/internal/settings"
)

func writePNG(t *testing.T, dir, name string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte("PNGDATA"), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestSaveAndResolveFallback(t *testing.T) {
	root := t.TempDir()
	src := t.TempDir()
	r := New(root)
	cfg := settings.Avatar{
		DefaultSet: "claude",
		AgentOrder: []string{"claude", "codex"},
		Sets:       map[string]map[string]string{},
	}
	r.SetConfig(cfg)

	rel, err := r.Save("claude", "idle", writePNG(t, src, "a.png"))
	if err != nil {
		t.Fatal(err)
	}
	if rel != "claude/idle.png" {
		t.Fatalf("rel = %q", rel)
	}
	cfg.Sets["claude"] = map[string]string{"idle": rel}
	r.SetConfig(cfg)

	url, set, own, ok := r.Resolve("claude", "idle")
	if !ok || !own || set != "claude" || url == "" {
		t.Fatalf("own resolve = %q %q %v %v", url, set, own, ok)
	}
	if !strings.Contains(url, "claude/idle.png") {
		t.Fatalf("url = %q", url)
	}

	url, set, own, ok = r.Resolve("codex", "idle")
	if !ok || own || set != "claude" || url == "" {
		t.Fatalf("fallback resolve = %q %q %v %v", url, set, own, ok)
	}

	if _, _, _, ok := r.Resolve("codex", "streaming"); ok {
		t.Fatal("resolved an image that does not exist")
	}
}

func TestSaveRejectsBadFiles(t *testing.T) {
	r := New(t.TempDir())
	src := t.TempDir()
	bad := filepath.Join(src, "a.jpg")
	if err := os.WriteFile(bad, []byte("JPG"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Save("claude", "idle", bad); err == nil {
		t.Fatal("accepted a JPEG")
	}
	big := filepath.Join(src, "big.png")
	f, err := os.Create(big)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(MaxBytes + 1); err != nil {
		t.Fatal(err)
	}
	f.Close()
	if _, err := r.Save("claude", "idle", big); err == nil {
		t.Fatal("accepted an oversized file")
	}
	if _, err := r.Save("   ", "idle", writePNG(t, src, "b.png")); err == nil {
		t.Fatal("accepted an empty agent")
	}
}

func TestSaveReplacesOtherExtension(t *testing.T) {
	r := New(t.TempDir())
	src := t.TempDir()
	if _, err := r.Save("claude", "idle", writePNG(t, src, "a.png")); err != nil {
		t.Fatal(err)
	}
	gif := filepath.Join(src, "b.gif")
	if err := os.WriteFile(gif, []byte("GIFDATA"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Save("claude", "idle", gif); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(r.Dir(), "claude", "idle.png")); !os.IsNotExist(err) {
		t.Fatal("old png was not removed")
	}
}

func TestServeHTTP(t *testing.T) {
	r := New(t.TempDir())
	src := t.TempDir()
	if _, err := r.Save("claude", "idle", writePNG(t, src, "a.png")); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "http://avatar.localhost/claude/idle.png", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("status = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "PNGDATA") {
		t.Fatalf("body = %q", rec.Body.String())
	}

	req = httptest.NewRequest("GET", "http://avatar.localhost/", nil)
	req.URL.Path = "/../config.json"
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != 404 {
		t.Fatalf("traversal status = %d", rec.Code)
	}
}
