package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/egoist/mygo"

	"app/internal/agents"
	"app/internal/settings"
)

// PanelService is the set of methods the page may call.
type PanelService struct {
	app *App
}

// GetState returns the current snapshot.
func (s PanelService) GetState() StateView {
	return stateView(s.app.hub.Snapshot(), s.app.configView())
}

// Refresh polls Magpie now and returns the state after the refresh starts.
func (s PanelService) Refresh() StateView {
	s.app.hub.Refresh()
	return s.GetState()
}

// GetAgents lists the agents Magpie detects, with their current settings.
func (s PanelService) GetAgents() ([]AgentView, error) {
	a := s.app
	a.agentMu.Lock()
	if time.Since(a.agentAt) < 20*time.Second {
		list := append([]agents.Agent(nil), a.agentList...)
		a.agentMu.Unlock()
		return agentViews(list), nil
	}
	a.agentMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	runner := agents.New(a.store.Get().Magpie.BinaryPath)
	list, err := runner.List(ctx)
	if err != nil {
		return nil, err
	}
	a.agentMu.Lock()
	a.agentAt = time.Now()
	a.agentList = list
	a.agentMu.Unlock()
	return agentViews(list), nil
}

// GetModels lists the models one agent may pick.
func (s PanelService) GetModels(agent string) ([]ModelOptionView, error) {
	a := s.app
	key := strings.ToLower(strings.TrimSpace(agent))
	a.modelMu.Lock()
	if c, ok := a.models[key]; ok && time.Since(c.at) < time.Minute {
		a.modelMu.Unlock()
		return modelViews(c.list), nil
	}
	a.modelMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	runner := agents.New(a.store.Get().Magpie.BinaryPath)
	list, err := runner.Models(ctx, agent)
	if err != nil {
		return nil, err
	}
	a.modelMu.Lock()
	a.models[key] = cachedModels{at: time.Now(), list: list}
	a.modelMu.Unlock()
	return modelViews(list), nil
}

// PickModel sets an agent's model and, when given, its effort.
func (s PanelService) PickModel(agent, model, effort string) (string, error) {
	a := s.app
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	runner := agents.New(a.store.Get().Magpie.BinaryPath)
	msg, err := runner.SetModel(ctx, agent, model, effort)
	if err != nil {
		return "", err
	}
	a.invalidateAgents()
	a.hub.Refresh()
	return msg, nil
}

// ChooseAvatar asks for an image file and makes it agent/state's image.
func (s PanelService) ChooseAvatar(agent, state string) (AvatarResult, error) {
	a := s.app
	agent = settings.Key(agent)
	state = strings.ToLower(strings.TrimSpace(state))
	if agent == "" {
		return AvatarResult{}, errors.New("choose an agent first")
	}
	if !settings.ValidState(state) {
		return AvatarResult{}, fmt.Errorf("unknown state %q", state)
	}
	files, err := mygo.Dialog.Open(mygo.OpenDialogOptions{
		Parent:      a.win,
		Title:       "選擇形象圖片",
		ButtonLabel: "使用",
		Filters: []mygo.FileFilter{{
			Name:       "圖片 (GIF, PNG, WebP)",
			Extensions: []string{"gif", "png", "webp"},
			MIMETypes:  []string{"image/*"},
		}},
	})
	if err != nil {
		return AvatarResult{}, err
	}
	if len(files) == 0 {
		return AvatarResult{}, nil
	}
	rel, err := a.av.Save(agent, state, files[0])
	if err != nil {
		return AvatarResult{}, err
	}
	next, err := a.store.Update(func(c *settings.Config) error {
		if c.Avatar.Sets[agent] == nil {
			c.Avatar.Sets[agent] = map[string]string{}
		}
		c.Avatar.Sets[agent][state] = rel
		if !hasAgent(c.Avatar.AgentOrder, agent) {
			c.Avatar.AgentOrder = append(c.Avatar.AgentOrder, agent)
		}
		return nil
	})
	if err != nil {
		_, _ = a.av.Clear(agent, state)
		return AvatarResult{}, err
	}
	a.av.SetConfig(next.Avatar)
	a.hub.Notify()
	url, set, _, _ := a.av.Resolve(agent, state)
	return AvatarResult{URL: url, Agent: agent, State: state, Set: set}, nil
}

// ClearAvatar removes agent/state's own image, leaving the fallback chain.
func (s PanelService) ClearAvatar(agent, state string) (StateView, error) {
	a := s.app
	agent = settings.Key(agent)
	state = strings.ToLower(strings.TrimSpace(state))
	if !settings.ValidState(state) {
		return s.GetState(), fmt.Errorf("unknown state %q", state)
	}
	next, err := a.store.Update(func(c *settings.Config) error {
		if states := c.Avatar.Sets[agent]; states != nil {
			delete(states, state)
			if len(states) == 0 {
				delete(c.Avatar.Sets, agent)
			}
		}
		return nil
	})
	if err != nil {
		return s.GetState(), err
	}
	_, _ = a.av.Clear(agent, state)
	a.av.SetConfig(next.Avatar)
	a.hub.Notify()
	return s.GetState(), nil
}

// SaveConfig applies the settings the page changed.
func (s PanelService) SaveConfig(patch ConfigPatch) (ConfigView, error) {
	a := s.app
	old := a.store.Get()

	if patch.Theme != nil {
		switch *patch.Theme {
		case "system", "light", "dark":
		default:
			return a.configView(), fmt.Errorf("unknown theme %q", *patch.Theme)
		}
	}
	if patch.Language != nil && !settings.ValidLanguage(*patch.Language) {
		return a.configView(), fmt.Errorf("unknown language %q", *patch.Language)
	}
	if patch.Port != nil && (*patch.Port < 0 || *patch.Port > 65535) {
		return a.configView(), fmt.Errorf("invalid port %d", *patch.Port)
	}
	if patch.Hotkey != nil && strings.TrimSpace(*patch.Hotkey) == "" {
		return a.configView(), errors.New("shortcut is empty")
	}
	if patch.BinaryPath != nil {
		p := strings.TrimSpace(*patch.BinaryPath)
		if p != "" {
			if st, err := os.Stat(p); err != nil || st.IsDir() {
				return a.configView(), fmt.Errorf("magpie not found at %s", p)
			}
		}
	}

	hotkeyChanged := patch.Hotkey != nil && strings.TrimSpace(*patch.Hotkey) != old.Hotkey
	if hotkeyChanged {
		if err := a.registerHotkey(*patch.Hotkey); err != nil {
			return a.configView(), fmt.Errorf("shortcut %s: %w", *patch.Hotkey, err)
		}
	}

	next, err := a.store.Update(func(c *settings.Config) error {
		if patch.Port != nil {
			c.Magpie.Port = *patch.Port
		}
		if patch.BinaryPath != nil {
			c.Magpie.BinaryPath = strings.TrimSpace(*patch.BinaryPath)
		}
		if patch.AlwaysOnTop != nil {
			c.Window.AlwaysOnTop = *patch.AlwaysOnTop
		}
		if patch.Hotkey != nil {
			c.Hotkey = strings.TrimSpace(*patch.Hotkey)
		}
		if patch.Autostart != nil {
			c.Autostart = *patch.Autostart
		}
		if patch.Theme != nil {
			c.Theme = *patch.Theme
		}
		if patch.Language != nil {
			c.Language = *patch.Language
		}
		if patch.DefaultSet != nil {
			c.Avatar.DefaultSet = settings.Key(*patch.DefaultSet)
			if c.Avatar.DefaultSet == "" {
				return errors.New("default set is empty")
			}
		}
		if patch.AgentOrder != nil {
			var order []string
			seen := map[string]bool{}
			for _, raw := range patch.AgentOrder {
				k := settings.Key(raw)
				if k == "" || seen[k] {
					continue
				}
				seen[k] = true
				order = append(order, k)
			}
			if len(order) == 0 {
				return errors.New("agent order is empty")
			}
			c.Avatar.AgentOrder = order
		}
		return nil
	})
	if err != nil {
		if hotkeyChanged {
			_ = a.registerHotkey(old.Hotkey)
		}
		return a.configView(), err
	}

	if a.win != nil {
		a.win.SetAlwaysOnTop(next.Window.AlwaysOnTop)
	}
	if err := mygo.App.SetOpenAtLogin(next.Autostart); err != nil {
		a.setAutostartErr(err.Error())
	} else {
		a.setAutostartErr("")
	}
	if patch.Hotkey != nil {
		a.setHotkeyErr("")
	}
	if patch.BinaryPath != nil {
		a.forgetBinary()
	}
	if patch.Port != nil || patch.BinaryPath != nil {
		// A missing CLI only breaks the Agents tab; gateway data still works.
		a.hub.Reconnect()
	}
	a.av.SetConfig(next.Avatar)
	a.hub.Notify()
	return a.configView(), nil
}

// ChooseBinary asks for a magpie executable and saves it as the override.
func (s PanelService) ChooseBinary() (ConfigView, error) {
	a := s.app
	files, err := mygo.Dialog.Open(mygo.OpenDialogOptions{
		Parent:      a.win,
		Title:       "選擇 magpie 執行檔",
		ButtonLabel: "使用",
		Filters: []mygo.FileFilter{{
			Name:       "magpie",
			Extensions: []string{"exe"},
		}},
	})
	if err != nil {
		return a.configView(), err
	}
	if len(files) == 0 {
		return a.configView(), nil
	}
	p := files[0]
	return s.SaveConfig(ConfigPatch{BinaryPath: &p})
}

// OpenMagpie opens Magpie's main window.
func (s PanelService) OpenMagpie() error {
	a := s.app
	return agents.New(a.store.Get().Magpie.BinaryPath).Open()
}

// ToggleMagpiePanel opens or closes Magpie's own tray panel.
func (s PanelService) ToggleMagpiePanel() error {
	a := s.app
	return agents.New(a.store.Get().Magpie.BinaryPath).Open("panel")
}

// RefreshNow is Refresh under a name a button can use.
func (s PanelService) RefreshNow() StateView {
	return s.Refresh()
}

// OpenDataFolder reveals config.json and avatars in the file manager.
func (s PanelService) OpenDataFolder() error {
	return openPath(s.app.dataDir)
}

// OpenAvatarFolder reveals the avatar images.
func (s PanelService) OpenAvatarFolder() error {
	return openPath(s.app.av.Dir())
}

// OpenReleases opens the project's GitHub releases page.
func (s PanelService) OpenReleases() error {
	return openURL("https://github.com/owogametools/magpie-statusP/releases")
}

// HideWindow hides the panel, leaving the tray icon and shortcut.
func (s PanelService) HideWindow() {
	if s.app.win != nil {
		s.app.win.Hide()
	}
}

// Quit exits the app.
func (s PanelService) Quit() {
	s.app.quitting.Store(true)
	mygo.App.Quit()
}

func (a *App) invalidateAgents() {
	a.agentMu.Lock()
	a.agentAt = time.Time{}
	a.agentMu.Unlock()
	a.modelMu.Lock()
	a.models = map[string]cachedModels{}
	a.modelMu.Unlock()
}

func hasAgent(order []string, agent string) bool {
	for _, a := range order {
		if a == agent {
			return true
		}
	}
	return false
}

func agentViews(list []agents.Agent) []AgentView {
	out := make([]AgentView, 0, len(list))
	for _, a := range list {
		out = append(out, AgentView{
			Name: a.Name, Key: a.Key, Model: a.Model, Details: a.Details,
			Fields: a.Fields, Effort: a.Effort, EffortField: a.EffortField, Path: a.Path,
		})
	}
	return out
}

func modelViews(list []agents.Model) []ModelOptionView {
	out := make([]ModelOptionView, 0, len(list))
	for _, m := range list {
		out = append(out, ModelOptionView{ID: m.ID, Name: m.Name, Levels: m.Levels})
	}
	return out
}
