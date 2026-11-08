// Magpie Panel's page. It runs inside Magpie's sandboxed iframe: no fetch,
// no WebSocket, no forms. Everything it knows comes from the bridge
// (theme, this plugin's options, usage:summary). Starting the app is the
// host's job; the page only writes launchAt and the host picks it up.

const TEXT = {
  "zh-TW": {
    subtitle: "Magpie 懸浮面板",
    "section.status": "狀態",
    "row.auto": "自動啟動",
    "row.path": "程式路徑",
    "row.last": "上次啟動請求",
    "auto.on": "開啟",
    "auto.off": "關閉",
    "path.auto": "自動下載",
    "last.never": "尚未啟動",
    "status.recent": "最近已請求啟動",
    "status.idle": "待啟動",
    "status.error": "設定有誤",
    "status.explain": "浮窗是獨立程式，關閉 Magpie 不會關閉它。",
    "section.controls": "控制",
    "btn.launch": "啟動浮窗",
    "btn.relaunch": "重新啟動浮窗",
    "auto.toggle": "隨 Magpie 啟動浮窗",
    "path.label": "自訂程式路徑",
    "path.placeholder": "/path/to/magpie-panel（留空則自動下載）",
    "btn.save": "儲存",
    "btn.clear": "清除",
    "btn.saving": "儲存中…",
    "path.hint": "需為絕對路徑，且不能包含「..」。Windows 需為 .exe；macOS 可選 .app 或其執行檔；Linux 需為執行檔。",
    "error.relative": "請輸入絕對路徑。",
    "error.dotdot": "路徑不能包含「..」。",
    "error.nobridge": "找不到 Magpie bridge，請從 Magpie 開啟此頁面。",
    "note.launch": "已送出啟動請求，程式會在背景啟動。",
    "note.saved": "已儲存。",
    "note.cleared": "已清除自訂路徑。",
    "note.throttle": "操作太快，請稍候再試。",
    "note.setFailed": "儲存失敗：",
    "section.usage": "今日用量",
    "usage.calls": "呼叫",
    "usage.tokens": "Tokens",
    "usage.cost": "費用",
    "usage.loading": "讀取中…",
    "usage.empty": "尚無今日用量。",
    "usage.denied": "無法讀取用量（權限不足或 Magpie 版本不支援）。",
    "usage.top": "最常用模型",
    "section.about": "關於",
    "about.separate": "浮窗是獨立程式，關閉 Magpie 不會關閉它；可在浮窗內設定開機啟動。",
    "about.smartscreen": "首次啟動若出現 Windows SmartScreen 或 macOS Gatekeeper 警告，請選擇允許執行（或右鍵開啟）。",
    "about.data": "資料與下載的程式位於",
    "about.logs": "若啟動失敗，詳情會寫入 Magpie 的日誌。",
  },
  zh: {
    subtitle: "Magpie 懸浮面板",
    "section.status": "狀態",
    "row.auto": "自動啟動",
    "row.path": "程式路徑",
    "row.last": "上次啟動請求",
    "auto.on": "開啟",
    "auto.off": "關閉",
    "path.auto": "自動下載",
    "last.never": "尚未啟動",
    "status.recent": "最近已請求啟動",
    "status.idle": "待啟動",
    "status.error": "設定有誤",
    "status.explain": "浮窗是獨立程式，關閉 Magpie 不會關閉它。",
    "section.controls": "控制",
    "btn.launch": "啟動浮窗",
    "btn.relaunch": "重新啟動浮窗",
    "auto.toggle": "隨 Magpie 啟動浮窗",
    "path.label": "自訂程式路徑",
    "path.placeholder": "/path/to/magpie-panel（留空則自動下載）",
    "btn.save": "儲存",
    "btn.clear": "清除",
    "btn.saving": "儲存中…",
    "path.hint": "需為絕對路徑，且不能包含「..」。Windows 需為 .exe；macOS 可選 .app 或其執行檔；Linux 需為執行檔。",
    "error.relative": "請輸入絕對路徑。",
    "error.dotdot": "路徑不能包含「..」。",
    "error.nobridge": "找不到 Magpie bridge，請從 Magpie 開啟此頁面。",
    "note.launch": "已送出啟動請求，程式會在背景啟動。",
    "note.saved": "已儲存。",
    "note.cleared": "已清除自訂路徑。",
    "note.throttle": "操作太快，請稍候再試。",
    "note.setFailed": "儲存失敗：",
    "section.usage": "今日用量",
    "usage.calls": "呼叫",
    "usage.tokens": "Tokens",
    "usage.cost": "費用",
    "usage.loading": "讀取中…",
    "usage.empty": "尚無今日用量。",
    "usage.denied": "無法讀取用量（權限不足或 Magpie 版本不支援）。",
    "usage.top": "最常用模型",
    "section.about": "關於",
    "about.separate": "浮窗是獨立程式，關閉 Magpie 不會關閉它；可在浮窗內設定開機啟動。",
    "about.smartscreen": "首次啟動若出現 Windows SmartScreen 或 macOS Gatekeeper 警告，請選擇允許執行（或右鍵開啟）。",
    "about.data": "資料與下載的程式位於",
    "about.logs": "若啟動失敗，詳情會寫入 Magpie 的日誌。",
  },
  en: {
    subtitle: "Floating panel for Magpie",
    "section.status": "Status",
    "row.auto": "Auto-launch",
    "row.path": "Binary",
    "row.last": "Last launch request",
    "auto.on": "On",
    "auto.off": "Off",
    "path.auto": "Download automatically",
    "last.never": "Never",
    "status.recent": "Launch requested recently",
    "status.idle": "Not launched yet",
    "status.error": "Check the settings",
    "status.explain": "The panel is a separate app: closing Magpie leaves it running.",
    "section.controls": "Controls",
    "btn.launch": "Launch panel",
    "btn.relaunch": "Relaunch panel",
    "auto.toggle": "Launch with Magpie",
    "path.label": "Custom binary path",
    "path.placeholder": "/path/to/magpie-panel (blank downloads automatically)",
    "btn.save": "Save",
    "btn.clear": "Clear",
    "btn.saving": "Saving…",
    "path.hint": 'Absolute path only; ".." is not allowed. Windows needs .exe; macOS accepts .app or its executable; Linux an executable.',
    "error.relative": "Enter an absolute path.",
    "error.dotdot": 'The path must not contain "..".',
    "error.nobridge": "Magpie's bridge is missing; open this page from Magpie.",
    "note.launch": "Launch requested; the app starts in the background.",
    "note.saved": "Saved.",
    "note.cleared": "Custom path cleared.",
    "note.throttle": "Too fast; wait a moment and try again.",
    "note.setFailed": "Could not save: ",
    "section.usage": "Today's usage",
    "usage.calls": "Calls",
    "usage.tokens": "Tokens",
    "usage.cost": "Cost",
    "usage.loading": "Loading…",
    "usage.empty": "No usage today.",
    "usage.denied": "Usage is unavailable (permission denied or unsupported Magpie version).",
    "usage.top": "Top model",
    "section.about": "About",
    "about.separate": "The panel is a separate app: closing Magpie leaves it running. Turn on login start inside the panel.",
    "about.smartscreen": "If Windows SmartScreen or macOS Gatekeeper warns on first launch, allow the app (or right-click Open).",
    "about.data": "Data and downloaded binaries live in",
    "about.logs": "If launching fails, the details go to Magpie's log.",
  },
};

const RECENT_LAUNCH_MS = 10 * 60 * 1000;
const OPTION_RATE_MS = 1100;

const elements = {
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  stateAuto: document.getElementById("stateAuto"),
  statePath: document.getElementById("statePath"),
  stateLast: document.getElementById("stateLast"),
  launchBtn: document.getElementById("launchBtn"),
  autoLaunchInput: document.getElementById("autoLaunchInput"),
  binaryInput: document.getElementById("binaryInput"),
  saveBtn: document.getElementById("saveBtn"),
  clearBtn: document.getElementById("clearBtn"),
  pathError: document.getElementById("pathError"),
  saveNote: document.getElementById("saveNote"),
  usageCalls: document.getElementById("usageCalls"),
  usageTokens: document.getElementById("usageTokens"),
  usageCost: document.getElementById("usageCost"),
  usageNote: document.getElementById("usageNote"),
  bridgeNote: document.getElementById("bridgeNote"),
};

const state = {
  lang: "zh-TW",
  options: { binaryPath: "", autoLaunch: true },
  usage: null,
  usageError: "",
  usageLoading: false,
  noteKey: "",
  noteArg: "",
  pathErrorKey: "",
  busy: false,
  lockedUntil: 0,
  hasBridge: false,
};

function bridge() {
  return typeof globalThis.magpie === "object" && globalThis.magpie
    ? globalThis.magpie
    : null;
}

function pickLang(raw) {
  const value = String(raw || "").toLowerCase();
  if (!value) return "zh-TW";
  if (value.startsWith("zh")) {
    return value.includes("tw") ||
      value.includes("hk") ||
      value.includes("hant")
      ? "zh-TW"
      : "zh";
  }
  return "en";
}

function text(key) {
  const table = TEXT[state.lang] || TEXT["zh-TW"];
  return table[key] !== undefined ? table[key] : key;
}

function normalizePageOptions(raw) {
  return {
    binaryPath: "",
    autoLaunch: true,
    ...(raw && typeof raw === "object" ? raw : {}),
  };
}

function describeError(error) {
  if (!error) return "";
  const message =
    typeof error === "string"
      ? error
      : typeof error.message === "string"
        ? error.message
        : String(error);
  return message.slice(0, 240);
}

function fmtNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  try {
    return new Intl.NumberFormat(state.lang === "en" ? "en" : "zh-TW").format(
      number,
    );
  } catch {
    return String(number);
  }
}

function formatTime(ms) {
  const date = new Date(ms);
  try {
    return new Intl.DateTimeFormat(state.lang === "en" ? "en" : "zh-TW", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function applyTheme(theme) {
  const dark = Boolean(theme && theme.dark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const lang =
    theme && typeof theme.lang === "string" && theme.lang
      ? pickLang(theme.lang)
      : state.lang;
  if (lang !== state.lang) {
    state.lang = lang;
    renderChrome();
    renderStatus();
    renderUsage();
    if (state.noteKey) showNote(state.noteKey, state.noteArg);
    if (state.pathErrorKey) showPathError(state.pathErrorKey);
  }
}

function renderChrome() {
  document.documentElement.lang = state.lang === "en" ? "en" : "zh-TW";
  for (const node of document.querySelectorAll("[data-i18n]")) {
    const key = node.getAttribute("data-i18n");
    if (key) node.textContent = text(key);
  }
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    const key = node.getAttribute("data-i18n-placeholder");
    if (key) node.setAttribute("placeholder", text(key));
  }
}

function lastLaunchAt() {
  const value = Number(state.options.lastLaunchAt);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function renderStatus() {
  const launchedAt = lastLaunchAt();
  const recent = launchedAt > 0 && Date.now() - launchedAt < RECENT_LAUNCH_MS;
  const path =
    typeof state.options.binaryPath === "string"
      ? state.options.binaryPath.trim()
      : "";

  elements.stateAuto.textContent =
    state.options.autoLaunch !== false ? text("auto.on") : text("auto.off");
  elements.statePath.textContent = path || text("path.auto");
  elements.statePath.title = path;
  elements.stateLast.textContent =
    launchedAt > 0 ? formatTime(launchedAt) : text("last.never");

  if (state.pathErrorKey) {
    elements.statusText.textContent = text("status.error");
    elements.statusDot.className = "dot warn";
  } else if (recent) {
    elements.statusText.textContent = text("status.recent");
    elements.statusDot.className = "dot on";
  } else {
    elements.statusText.textContent = text("status.idle");
    elements.statusDot.className = "dot";
  }

  elements.launchBtn.textContent = launchedAt > 0 ? text("btn.relaunch") : text("btn.launch");
}

function renderUsage() {
  if (state.usageLoading) {
    elements.usageCalls.textContent = "—";
    elements.usageTokens.textContent = "—";
    elements.usageCost.textContent = "—";
    elements.usageNote.textContent = text("usage.loading");
    elements.usageNote.title = "";
    return;
  }

  if (state.usageError) {
    elements.usageCalls.textContent = "—";
    elements.usageTokens.textContent = "—";
    elements.usageCost.textContent = "—";
    elements.usageNote.textContent = text("usage.denied");
    elements.usageNote.title = state.usageError;
    return;
  }

  const summary = state.usage;
  if (!summary) {
    elements.usageCalls.textContent = "—";
    elements.usageTokens.textContent = "—";
    elements.usageCost.textContent = "—";
    elements.usageNote.textContent = text("usage.empty");
    elements.usageNote.title = "";
    return;
  }

  elements.usageCalls.textContent = fmtNumber(summary.calls);
  elements.usageTokens.textContent = fmtNumber(
    Number(summary.input || 0) + Number(summary.output || 0),
  );
  elements.usageCost.textContent = `$${(Number(summary.cost) || 0).toFixed(2)}`;

  const top =
    Array.isArray(summary.models) &&
    summary.models[0] &&
    typeof summary.models[0].model === "string"
      ? summary.models[0].model
      : "";
  elements.usageNote.textContent = top ? `${text("usage.top")} · ${top}` : "";
  elements.usageNote.title = "";
}

function showNote(key, arg) {
  state.noteKey = key || "";
  state.noteArg = arg || "";
  if (!key) {
    elements.saveNote.textContent = "";
    return;
  }
  elements.saveNote.textContent = arg ? `${text(key)}${arg}` : text(key);
}

function showPathError(key) {
  state.pathErrorKey = key || "";
  elements.pathError.textContent = key ? text(key) : "";
  renderStatus();
}

function refreshControls() {
  const locked = state.busy || Date.now() < state.lockedUntil;
  const disabled = locked || !state.hasBridge;
  elements.launchBtn.disabled = disabled;
  elements.saveBtn.disabled = disabled;
  elements.clearBtn.disabled = disabled;
  elements.autoLaunchInput.disabled = disabled;
  elements.binaryInput.disabled = !state.hasBridge;
  elements.saveBtn.textContent = state.busy ? text("btn.saving") : text("btn.save");
  elements.launchBtn.textContent =
    lastLaunchAt() > 0 ? text("btn.relaunch") : text("btn.launch");
}

function holdControls() {
  refreshControls();
  const wait = state.lockedUntil - Date.now();
  if (wait > 0) {
    window.setTimeout(() => {
      state.busy = false;
      refreshControls();
    }, wait + 30);
  }
}

function showBridgeNotice() {
  elements.bridgeNote.hidden = false;
  elements.bridgeNote.textContent = text("error.nobridge");
  elements.statusText.textContent = text("status.error");
  elements.statusDot.className = "dot err";
}

function validatePath(value) {
  if (!value) return "";
  if (value.includes("\0")) return "error.relative";
  if (value.split(/[\\/]+/).includes("..")) return "error.dotdot";
  const windowsAbsolute = /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
  const posixAbsolute = value.startsWith("/");
  if (!windowsAbsolute && !posixAbsolute) return "error.relative";
  return "";
}

async function loadOptions() {
  const magpie = bridge();
  const current = await magpie.options.get();
  state.options = normalizePageOptions(current);
  elements.binaryInput.value =
    typeof state.options.binaryPath === "string" ? state.options.binaryPath : "";
  elements.autoLaunchInput.checked = state.options.autoLaunch !== false;
}

async function saveOptions(patch, noteKey) {
  const magpie = bridge();
  if (!magpie) {
    showNote("error.nobridge");
    return false;
  }
  const now = Date.now();
  if (now < state.lockedUntil) {
    showNote("note.throttle");
    return false;
  }
  state.lockedUntil = now + OPTION_RATE_MS;
  state.busy = true;
  refreshControls();

  try {
    const current = await magpie.options.get();
    const merged = { ...normalizePageOptions(current), ...patch };
    const saved = await magpie.options.set(merged);
    state.options = normalizePageOptions(
      saved && typeof saved === "object" ? saved : merged,
    );
    if (typeof state.options.binaryPath === "string") {
      elements.binaryInput.value = state.options.binaryPath;
    }
    elements.autoLaunchInput.checked = state.options.autoLaunch !== false;
    showNote(noteKey);
    renderStatus();
    return true;
  } catch (error) {
    showNote("note.setFailed", describeError(error));
    return false;
  } finally {
    state.busy = false;
    holdControls();
  }
}

async function loadUsage() {
  const magpie = bridge();
  if (!magpie || state.usageLoading) return;
  if (typeof magpie.read !== "function") {
    state.usage = null;
    state.usageError = "this Magpie version exposes no page reads";
    renderUsage();
    return;
  }
  state.usageLoading = true;
  renderUsage();
  try {
    const summary = await magpie.read("usage:summary", { period: "today" });
    state.usage = summary && typeof summary === "object" ? summary : null;
    state.usageError = "";
  } catch (error) {
    state.usage = null;
    state.usageError = describeError(error);
  } finally {
    state.usageLoading = false;
    renderUsage();
  }
}

// Saving options stops the plugin host (Magpie's SetOptions calls Restart),
// and Magpie starts it again only when the page's HTML is served. Reloading
// the frame is that request: the host loads, sees launchAt or autoLaunch and
// launches the app. Without it a launch click would only write the option.
function rewarmHost() {
  window.setTimeout(() => window.location.reload(), 350);
}

function wire() {
  elements.launchBtn.addEventListener("click", async () => {
    const now = Date.now();
    showPathError("");
    const saved = await saveOptions(
      { launchAt: now, lastLaunchAt: now },
      "note.launch",
    );
    if (saved) {
      renderStatus();
      rewarmHost();
    }
  });

  elements.autoLaunchInput.addEventListener("change", async () => {
    const wanted = elements.autoLaunchInput.checked;
    const saved = await saveOptions({ autoLaunch: wanted }, "note.saved");
    if (!saved) {
      elements.autoLaunchInput.checked = state.options.autoLaunch !== false;
    }
    renderStatus();
    if (saved && wanted) rewarmHost();
  });

  elements.saveBtn.addEventListener("click", async () => {
    const value = elements.binaryInput.value.trim();
    const errorKey = validatePath(value);
    if (errorKey) {
      showPathError(errorKey);
      return;
    }
    showPathError("");
    const saved = await saveOptions(
      { binaryPath: value },
      value ? "note.saved" : "note.cleared",
    );
    if (saved) {
      renderStatus();
      if (state.options.autoLaunch !== false) rewarmHost();
    }
  });

  elements.clearBtn.addEventListener("click", async () => {
    elements.binaryInput.value = "";
    showPathError("");
    const saved = await saveOptions({ binaryPath: "" }, "note.cleared");
    if (saved) {
      renderStatus();
      if (state.options.autoLaunch !== false) rewarmHost();
    }
  });
}

async function main() {
  wire();
  renderChrome();
  renderStatus();
  renderUsage();
  refreshControls();

  const magpie = bridge();
  if (!magpie || !magpie.options || typeof magpie.options.get !== "function") {
    state.hasBridge = false;
    showBridgeNotice();
    refreshControls();
    return;
  }

  state.hasBridge = true;
  refreshControls();

  try {
    await magpie.ready;
    if (magpie.theme) applyTheme(magpie.theme);
    if (typeof magpie.onTheme === "function") magpie.onTheme(applyTheme);
    await loadOptions();
    renderChrome();
    renderStatus();
    renderUsage();
    refreshControls();
    void loadUsage();
    window.setInterval(() => {
      void loadUsage();
    }, 60000);
  } catch (error) {
    showNote("note.setFailed", describeError(error));
  }
}

void main();
