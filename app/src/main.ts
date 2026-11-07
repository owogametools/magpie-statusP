import {
  events,
  PanelService,
  type ConfigView,
  type StateView,
} from "./mygo";
import {
  applyStatic,
  getLanguage,
  normalizeLanguage,
  setLanguage,
  t,
} from "./i18n";
import { applyTheme } from "./theme";
import { byId, setText } from "./dom";
import { icon, LOGO } from "./icons";
import { createToaster } from "./toast";
import { errorMessage } from "./errors";
import { timeOfDay } from "./format";
import { createUsageTab } from "./tabs/usage";
import { createAgentsTab } from "./tabs/agents";
import { createActionsTab } from "./tabs/actions";
import { createAvatarTab } from "./tabs/avatar";
import { createSettingsTab } from "./tabs/settings";
import {
  isTabId,
  TAB_IDS,
  type AppContext,
  type TabId,
  type TabView,
} from "./types";

let state: StateView | null = null;
let bootError = "";
let activeTab: TabId = "usage";
let frame = 0;
let languageGuard: { value: string; until: number } | null = null;
let immersive = false;

const toaster = createToaster(byId("toasts"));

const panels: Record<TabId, HTMLElement> = {
  usage: byId("panel-usage"),
  agents: byId("panel-agents"),
  actions: byId("panel-actions"),
  avatar: byId("panel-avatar"),
  settings: byId("panel-settings"),
};

const tabButtons: Record<TabId, HTMLButtonElement> = {
  usage: byId<HTMLButtonElement>("tab-usage"),
  agents: byId<HTMLButtonElement>("tab-agents"),
  actions: byId<HTMLButtonElement>("tab-actions"),
  avatar: byId<HTMLButtonElement>("tab-avatar"),
  settings: byId<HTMLButtonElement>("tab-settings"),
};

const footerDot = byId("footerDot");
const footerText = byId("footerStatusText");
const footerStatus = byId("footerStatus");
const headerDot = byId("headerDot");

// Chrome hidden while immersive: titlebar, tab bar, footer.
const shellChrome = [byId("titlebar"), byId("tabs"), byId("footer")];

const ctx: AppContext = {
  getState: () => state,
  getBootError: () => bootError,
  toast: (message, kind) => toaster.show(message, kind),
  errorToast: (err) => {
    toaster.show(errorMessage(err) || t("common.error"), "error");
  },
  navigate: (tab) => activateTab(tab),
  applyState: (next) => applyState(next),
  applyConfig: (config) => applyConfig(config),
  saveConfig: async (patch) => {
    const config = await PanelService.saveConfig(patch);
    applyConfig(config);
    return config;
  },
  refreshNow: async () => {
    const next = await PanelService.refreshNow();
    applyState(next);
    return next;
  },
  applyLanguage: (language, optimistic) => applyLanguage(language, optimistic),
  isImmersive: () => immersive,
  setImmersive: (active) => setImmersive(active),
};

const tabs: Record<TabId, TabView> = {
  usage: createUsageTab(ctx),
  agents: createAgentsTab(ctx),
  actions: createActionsTab(ctx),
  avatar: createAvatarTab(ctx),
  settings: createSettingsTab(ctx),
};

for (const id of TAB_IDS) {
  panels[id].append(tabs[id].el);
}

installShell();

function installShell(): void {
  byId("brandLogo").innerHTML = LOGO;
  byId<HTMLButtonElement>("refreshBtn").append(icon("refresh"));
  byId<HTMLButtonElement>("settingsBtn").append(icon("gear"));
  byId<HTMLButtonElement>("hideBtn").append(icon("hide"));

  const refreshBtn = byId<HTMLButtonElement>("refreshBtn");
  refreshBtn.addEventListener("click", () => {
    if (refreshBtn.disabled) return;
    refreshBtn.disabled = true;
    refreshBtn.classList.add("busy");
    void PanelService.refreshNow()
      .then((next) => applyState(next))
      .catch((err) => ctx.errorToast(err))
      .finally(() => {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove("busy");
      });
  });

  byId<HTMLButtonElement>("settingsBtn").addEventListener("click", () => {
    activateTab("settings");
  });

  byId<HTMLButtonElement>("hideBtn").addEventListener("click", () => {
    void PanelService.hideWindow().catch((err) => ctx.errorToast(err));
  });

  byId<HTMLButtonElement>("footerOpen").addEventListener("click", () => {
    void PanelService.openMagpie().catch((err) => ctx.errorToast(err));
  });

  byId<HTMLButtonElement>("footerQuit").addEventListener("click", () => {
    if (!window.confirm(t("footer.quitConfirm"))) return;
    void PanelService.quit().catch((err) => ctx.errorToast(err));
  });

  for (const id of TAB_IDS) {
    tabButtons[id].addEventListener("click", () => activateTab(id));
  }

  byId("tabs").addEventListener("keydown", (event) => {
    const index = TAB_IDS.indexOf(activeTab);
    let next = -1;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % TAB_IDS.length;
        break;
      case "ArrowLeft":
        next = (index - 1 + TAB_IDS.length) % TAB_IDS.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = TAB_IDS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const id = TAB_IDS[next];
    if (!id) return;
    activateTab(id);
    tabButtons[id].focus();
  });
}

function setImmersive(active: boolean): void {
  if (immersive === active) return;
  immersive = active;
  for (const el of shellChrome) el.hidden = active;
  if (active && activeTab !== "avatar") {
    activateTab("avatar");
    return;
  }
  scheduleRender();
}

function activateTab(tab: TabId): void {
  if (immersive && tab !== "avatar") setImmersive(false);
  activeTab = tab;
  for (const id of TAB_IDS) {
    const selected = id === tab;
    tabButtons[id].setAttribute("aria-selected", String(selected));
    tabButtons[id].tabIndex = selected ? 0 : -1;
    panels[id].hidden = !selected;
  }
  tabs[tab].update();
}

function scheduleRender(): void {
  if (frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    tabs[activeTab].update();
  });
}

function applyState(next: StateView): void {
  state = next;
  bootError = "";
  applyTheme(next.config.theme);

  const language = normalizeLanguage(next.config.language);
  if (language !== getLanguage()) {
    const now = Date.now();
    const stale =
      languageGuard !== null &&
      now < languageGuard.until &&
      language !== languageGuard.value;
    if (!stale) {
      if (languageGuard && language === languageGuard.value) {
        languageGuard = null;
      }
      applyLanguage(language);
    }
  } else if (languageGuard && languageGuard.value === language) {
    languageGuard = null;
  }

  updateShell();
  scheduleRender();
}

function applyConfig(config: ConfigView): void {
  if (state) {
    state = {
      ...state,
      config,
      defaultSet: config.defaultSet,
      agentOrder: config.agentOrder,
    };
  }
  applyTheme(config.theme);

  const language = normalizeLanguage(config.language);
  if (language !== getLanguage()) {
    applyLanguage(language);
  }

  updateShell();
  scheduleRender();
}

function applyLanguage(language: string, optimistic = false): void {
  const next = normalizeLanguage(language);
  if (optimistic) {
    languageGuard = { value: next, until: Date.now() + 4000 };
  }
  const changed = setLanguage(next);
  applyStatic(document);
  updateShell();

  if (changed) {
    for (const id of TAB_IDS) {
      const panel = panels[id];
      const top = panel.scrollTop;
      tabs[id].rebuild();
      if (panel.scrollTop !== top) panel.scrollTop = top;
    }
  }
  scheduleRender();
}

function updateShell(): void {
  const connected = state?.connected ?? false;

  footerDot.className = connected ? "dot live" : "dot off";
  headerDot.className = connected ? "brand-dot online" : "brand-dot off";
  headerDot.title = connected ? t("common.online") : t("common.offline");

  let status: string;
  if (state) {
    status = connected
      ? t("footer.connectedAt", {
          time: state.updatedAt ? timeOfDay(state.updatedAt) : "—",
        })
      : t("footer.offline");
  } else {
    status = bootError ? t("footer.offline") : t("common.loading");
  }
  setText(footerText, status);
  footerStatus.title = connected ? "" : state?.error || bootError || "";
}

applyStatic(document);
updateShell();
activateTab("usage");

events.state.on((next) => applyState(next));
events.navigate.on((tab) => {
  if (isTabId(tab)) activateTab(tab);
});

void PanelService.getState()
  .then((next) => applyState(next))
  .catch((err) => {
    bootError = errorMessage(err) || t("common.error");
    ctx.errorToast(err);
    updateShell();
    scheduleRender();
  });
