// Magpie Panel is a floating, resizable copy of Magpie's tray panel, with a
// live avatar driven by Magpie's routing events.
package main

import (
	"context"
	_ "embed"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/egoist/mygo"

	"app/internal/agents"
	"app/internal/avatar"
	"app/internal/panel"
	"app/internal/settings"
)

//go:embed resources/tray.png
var trayIcon []byte

// StateEvent carries every state change to the page.
var StateEvent = mygo.NewEvent[StateView]("state")

// NavigateEvent asks the page to switch tabs, e.g. on a tray right click.
var NavigateEvent = mygo.NewEvent[string]("navigate")

// App owns the window, tray, config and the data hub.
type App struct {
	dataDir string
	store   *settings.Store
	av      *avatar.Resolver
	hub     *panel.Hub
	win     *mygo.Window
	tray    *mygo.Tray

	hotkeyMu sync.Mutex
	hotkey   string

	quitting atomic.Bool

	errMu        sync.Mutex
	hotkeyErr    string
	autostartErr string

	binMu   sync.Mutex
	binAt   time.Time
	binPath string

	agentMu   sync.Mutex
	agentAt   time.Time
	agentList []agents.Agent

	modelMu sync.Mutex
	models  map[string]cachedModels
}

type cachedModels struct {
	at   time.Time
	list []agents.Model
}

func main() {
	if !mygo.App.RequestSingleInstanceLock() {
		return
	}
	a := newApp()
	mygo.Bind(PanelService{app: a})
	mygo.App.OnSecondInstance(func(args []string, workingDir string) {
		a.showPanel()
	})
	mygo.App.WhenReady(a.start)
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}

func newApp() *App {
	dir, err := dataDir()
	if err != nil {
		log.Fatal(err)
	}
	store, err := settings.Load(dir)
	if err != nil {
		log.Fatal(err)
	}
	avatarsDir := filepath.Join(dir, "avatars")
	// A broken install must not keep the panel from starting; it simply has
	// no avatar until the next launch.
	if err := seedDefaultAvatars(store, avatarsDir); err != nil {
		log.Printf("default avatars: %v", err)
	}
	av := avatar.New(avatarsDir)
	av.SetConfig(store.Get().Avatar)
	return &App{
		dataDir: dir,
		store:   store,
		av:      av,
		hub:     panel.New(store, av),
		models:  map[string]cachedModels{},
	}
}

// seedDefaultAvatars installs the bundled set only when the user has no sets
// at all, so an upgrade never replaces a configured avatar.
func seedDefaultAvatars(store *settings.Store, avatarsDir string) error {
	if len(store.Get().Avatar.Sets) > 0 {
		return nil
	}
	installed, err := avatar.InstallDefaults(avatarsDir)
	if err != nil {
		return err
	}
	_, err = store.Update(func(c *settings.Config) error {
		c.Avatar.Sets[avatar.DefaultSet] = installed
		if c.Avatar.DefaultSet == "" {
			c.Avatar.DefaultSet = avatar.DefaultSet
		}
		return nil
	})
	return err
}

// dataDir keeps config and avatars together under %AppData%\MagpiePanel.
func dataDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		home, herr := os.UserHomeDir()
		if herr != nil {
			return "", herr
		}
		base = home
	}
	dir := filepath.Join(base, "MagpiePanel")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

func (a *App) start() {
	cfg := a.store.Get()

	if err := mygo.Protocol.HandleFunc("avatar", a.av.ServeHTTP); err != nil {
		log.Printf("avatar protocol: %v", err)
	}

	a.win = mygo.NewWindow(mygo.WindowOptions{
		Title:           "Magpie Panel",
		Width:           cfg.Window.Width,
		Height:          cfg.Window.Height,
		MinWidth:        360,
		MinHeight:       480,
		Frameless:       true,
		Panel:           true,
		AlwaysOnTop:     cfg.Window.AlwaysOnTop,
		SkipTaskbar:     true,
		Transparent:     true,
		CornerRadius:    12,
		BackgroundColor: "#1c1c1e",
		StateKey:        "magpie-panel-main",
		URL:             "/",
	})
	a.win.OnClose(func(e *mygo.CloseEvent) {
		if !a.quitting.Load() {
			e.PreventDefault()
			a.win.Hide()
		}
	})
	a.win.OnShow(func() {
		a.ensureVisible()
	})

	a.tray = a.newTray()
	if err := a.registerHotkey(cfg.Hotkey); err != nil {
		a.setHotkeyErr(err.Error())
	} else {
		a.setHotkeyErr("")
	}
	if err := mygo.App.SetOpenAtLogin(cfg.Autostart); err != nil {
		a.setAutostartErr(err.Error())
	} else {
		a.setAutostartErr("")
	}

	unsub := a.hub.Subscribe(func(s panel.Snapshot) {
		StateEvent.Broadcast(stateView(s, a.configView()))
	})
	_ = unsub // the hub lives as long as the process

	go a.hub.Run(context.Background())
	a.ensureVisible()
}

func (a *App) newTray() *mygo.Tray {
	tray, err := mygo.NewTray(mygo.TrayOptions{
		ID:      "magpie-panel",
		Icon:    trayIcon,
		ToolTip: "Magpie Panel",
	})
	if err != nil {
		log.Printf("tray: %v", err)
		return nil
	}
	// No menu: MyGo sends OnClick only to an icon without one, and clicking
	// the icon must toggle the panel. The settings tab carries the rest.
	tray.OnClick(func() { a.togglePanel() })
	tray.OnRightClick(func() {
		a.showPanel()
		_ = NavigateEvent.Broadcast("settings")
	})
	return tray
}

func (a *App) togglePanel() {
	if a.win == nil {
		return
	}
	if a.win.IsVisible() {
		a.win.Hide()
		return
	}
	a.showPanel()
}

func (a *App) showPanel() {
	if a.win == nil {
		return
	}
	a.ensureVisible()
	a.win.Show()
	a.win.Focus()
}

// ensureVisible brings a window back from a monitor that is gone.
func (a *App) ensureVisible() {
	if a.win == nil {
		return
	}
	b := a.win.Bounds()
	if b.Width <= 0 || b.Height <= 0 {
		return
	}
	for _, d := range mygo.Screen.Displays() {
		if overlap(b, d.WorkArea) >= 64*64 {
			return
		}
	}
	a.win.Center()
}

func overlap(a, b mygo.Rectangle) int {
	x1 := maxInt(a.X, b.X)
	y1 := maxInt(a.Y, b.Y)
	x2 := minInt(a.X+a.Width, b.X+b.Width)
	y2 := minInt(a.Y+a.Height, b.Y+b.Height)
	if x2 <= x1 || y2 <= y1 {
		return 0
	}
	return (x2 - x1) * (y2 - y1)
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// registerHotkey swaps the global shortcut, putting the old one back when the
// new accelerator is taken or malformed.
func (a *App) registerHotkey(acc string) error {
	acc = strings.TrimSpace(acc)
	if acc == "" {
		return errString("shortcut is empty")
	}
	a.hotkeyMu.Lock()
	defer a.hotkeyMu.Unlock()
	if a.hotkey == acc && mygo.GlobalShortcut.IsRegistered(acc) {
		return nil
	}
	old := a.hotkey
	if old != "" {
		mygo.GlobalShortcut.Unregister(old)
	}
	if err := mygo.GlobalShortcut.Register(acc, a.togglePanel); err != nil {
		if old != "" {
			_ = mygo.GlobalShortcut.Register(old, a.togglePanel)
		}
		return err
	}
	a.hotkey = acc
	return nil
}

type errString string

func (e errString) Error() string { return string(e) }

func (a *App) setHotkeyErr(s string) {
	a.errMu.Lock()
	a.hotkeyErr = s
	a.errMu.Unlock()
}

func (a *App) setAutostartErr(s string) {
	a.errMu.Lock()
	a.autostartErr = s
	a.errMu.Unlock()
}

func (a *App) errors() (hotkey, autostart string) {
	a.errMu.Lock()
	defer a.errMu.Unlock()
	return a.hotkeyErr, a.autostartErr
}

// detectedBinary finds the magpie CLI, caching the answer for five minutes
// (detection may shell out to PowerShell when Magpie lives off PATH).
func (a *App) detectedBinary() string {
	a.binMu.Lock()
	defer a.binMu.Unlock()
	if time.Since(a.binAt) < 5*time.Minute {
		return a.binPath
	}
	a.binAt = time.Now()
	a.binPath = agents.FindBinary(a.store.Get().Magpie.BinaryPath)
	return a.binPath
}

func (a *App) forgetBinary() {
	a.binMu.Lock()
	a.binAt = time.Time{}
	a.binMu.Unlock()
}

func (a *App) configView() ConfigView {
	cfg := a.store.Get()
	v := ConfigView{
		Port:           cfg.Magpie.Port,
		BinaryPath:     cfg.Magpie.BinaryPath,
		DetectedBinary: a.detectedBinary(),
		AlwaysOnTop:    cfg.Window.AlwaysOnTop,
		Hotkey:         cfg.Hotkey,
		Autostart:      cfg.Autostart,
		Theme:          cfg.Theme,
		Language:       cfg.Language,
		DefaultSet:     cfg.Avatar.DefaultSet,
		AgentOrder:     append([]string(nil), cfg.Avatar.AgentOrder...),
		Width:          cfg.Window.Width,
		Height:         cfg.Window.Height,
		Version:        mygo.App.Version(),
		DataDir:        a.dataDir,
		AvatarDir:      a.av.Dir(),
	}
	v.HotkeyError, v.AutostartError = a.errors()
	return v
}

func openPath(path string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("explorer.exe", path).Start()
	case "darwin":
		return exec.Command("open", path).Start()
	default:
		return exec.Command("xdg-open", path).Start()
	}
}

func openURL(raw string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", raw).Start()
	case "darwin":
		return exec.Command("open", raw).Start()
	default:
		return exec.Command("xdg-open", raw).Start()
	}
}
