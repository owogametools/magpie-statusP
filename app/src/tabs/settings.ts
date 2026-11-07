import { PanelService } from "../mygo";
import { clear, h, setHidden, setText } from "../dom";
import { errorMessage } from "../errors";
import { getLanguage, LANGS, t } from "../i18n";
import type { Lang } from "../i18n";
import { applyTheme, getThemeMode } from "../theme";
import type { AppContext, TabView } from "../types";

interface Refs {
  themeButtons: Record<string, HTMLButtonElement>;
  languageSelect: HTMLSelectElement;
  alwaysOnTop: HTMLInputElement;
  autostart: HTMLInputElement;
  autostartError: HTMLElement;
  hotkey: HTMLInputElement;
  hotkeySave: HTMLButtonElement;
  hotkeyConfigError: HTMLElement;
  hotkeyLocalError: HTMLElement;
  port: HTMLInputElement;
  portSave: HTMLButtonElement;
  portError: HTMLElement;
  binaryPath: HTMLElement;
  detected: HTMLElement;
  browse: HTMLButtonElement;
  autoDetect: HTMLButtonElement;
  binaryLocalError: HTMLElement;
  dataDir: HTMLElement;
  avatarDir: HTMLElement;
  appVersion: HTMLElement;
  quit: HTMLButtonElement;
}

interface Segment {
  el: HTMLElement;
  buttons: Record<string, HTMLButtonElement>;
}

export function createSettingsTab(ctx: AppContext): TabView {
  const el = h("div", { class: "settings" });
  let themePending: string | null = null;
  let hotkeyDirty = false;
  let portDirty = false;
  let refs = build();

  function build(): Refs {
    clear(el);

    const theme = segmented(
      t("settings.theme"),
      [
        { value: "system", label: t("settings.system") },
        { value: "light", label: t("settings.light") },
        { value: "dark", label: t("settings.dark") },
      ],
      (value) => void chooseTheme(value),
    );
    const languageLabels: Record<Lang, string> = {
      "zh-TW": t("settings.langZh"),
      "zh-CN": t("settings.langZhCN"),
      ja: t("settings.langJa"),
      en: t("settings.langEn"),
    };
    const languageSelect = h("select", {
      class: "select settings-select",
      attrs: { "aria-label": t("settings.language") },
    });
    for (const value of LANGS) {
      languageSelect.append(
        h("option", { value, text: languageLabels[value] }),
      );
    }
    languageSelect.addEventListener("change", () =>
      void chooseLanguage(languageSelect.value),
    );

    const appearance = h(
      "div",
      { class: "card pad" },
      h("div", { class: "card-title", text: t("settings.appearance") }),
      settingsRow(t("settings.theme"), theme.el),
      settingsRow(t("settings.language"), languageSelect),
    );

    const alwaysOnTop = h("input", { class: "switch", type: "checkbox" });
    alwaysOnTop.addEventListener("change", () =>
      void saveToggle("alwaysOnTop", alwaysOnTop),
    );
    const autostart = h("input", { class: "switch", type: "checkbox" });
    autostart.addEventListener("change", () =>
      void saveToggle("autostart", autostart),
    );
    const autostartError = h("p", { class: "field-error", hidden: true });

    const windowCard = h(
      "div",
      { class: "card pad" },
      h("div", { class: "card-title", text: t("settings.window") }),
      switchRow(
        alwaysOnTop,
        t("settings.alwaysOnTop"),
        t("settings.alwaysOnTopDesc"),
      ),
      switchRow(
        autostart,
        t("settings.autostart"),
        t("settings.autostartDesc"),
      ),
      autostartError,
    );

    const hotkey = h("input", {
      class: "input",
      type: "text",
      attrs: {
        autocomplete: "off",
        spellcheck: "false",
        placeholder: "Alt+Shift+M",
      },
    });
    const hotkeySave = h("button", {
      class: "btn",
      type: "button",
      text: t("common.save"),
      on: { click: () => void saveHotkey() },
    });
    hotkey.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void saveHotkey();
      }
    });
    hotkey.addEventListener("input", () => {
      hotkeyDirty = true;
      setError(refs.hotkeyLocalError, "");
    });
    const hotkeyConfigError = h("p", { class: "field-error", hidden: true });
    const hotkeyLocalError = h("p", { class: "field-error", hidden: true });

    const hotkeyCard = h(
      "div",
      { class: "card pad" },
      h("div", { class: "card-title", text: t("settings.hotkey") }),
      h("div", { class: "field-inline" }, hotkey, hotkeySave),
      h("p", { class: "field-hint", text: t("settings.hotkeyHint") }),
      hotkeyConfigError,
      hotkeyLocalError,
    );

    const port = h("input", {
      class: "input",
      type: "number",
      min: 0,
      max: 65535,
      step: 1,
      attrs: { inputmode: "numeric" },
    });
    const portSave = h("button", {
      class: "btn",
      type: "button",
      text: t("common.save"),
      on: { click: () => void savePort() },
    });
    port.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void savePort();
      }
    });
    port.addEventListener("input", () => {
      portDirty = true;
      setError(refs.portError, "");
    });
    const portError = h("p", { class: "field-error", hidden: true });

    const portCard = h(
      "div",
      { class: "card pad" },
      h("div", { class: "card-title", text: t("settings.port") }),
      h("div", { class: "field-inline" }, port, portSave),
      h("p", { class: "field-hint", text: t("settings.portHint") }),
      portError,
    );

    const binaryPath = h("dd", {
      class: "mono selectable path-value",
      text: "—",
    });
    const detected = h("dd", { class: "mono path-value", text: "—" });
    const browse = h("button", {
      class: "btn",
      type: "button",
      text: t("settings.browse"),
      on: { click: () => void browseBinary() },
    });
    const autoDetect = h("button", {
      class: "btn",
      type: "button",
      text: t("settings.autoDetect"),
      on: { click: () => void autoDetectBinary() },
    });
    const binaryLocalError = h("p", { class: "field-error", hidden: true });
    const dataDir = h("dd", { class: "mono selectable path-value", text: "—" });
    const avatarDir = h("dd", {
      class: "mono selectable path-value",
      text: "—",
    });
    const appVersion = h("dd", { class: "mono", text: "—" });

    const magpieCard = h(
      "div",
      { class: "card pad" },
      h("div", { class: "card-title", text: t("settings.magpie") }),
      h(
        "dl",
        { class: "kv-list" },
        kv(t("settings.binaryPath"), binaryPath),
      ),
      h("div", { class: "row-actions" }, browse, autoDetect),
      h(
        "dl",
        { class: "kv-list" },
        kv(t("settings.detected"), detected),
        kv(t("settings.dataDir"), dataDir),
        kv(t("settings.avatarDir"), avatarDir),
        kv(t("settings.appVersion"), appVersion),
      ),
      binaryLocalError,
    );

    const quit = h("button", {
      class: "btn danger",
      type: "button",
      text: t("settings.quit"),
      on: { click: () => void quitApp() },
    });
    const quitCard = h(
      "div",
      { class: "card pad danger-zone" },
      h(
        "div",
        {},
        h("div", { class: "card-title", text: t("settings.quit") }),
        h("p", { class: "field-hint", text: t("settings.quitDesc") }),
      ),
      quit,
    );

    el.append(appearance, windowCard, hotkeyCard, portCard, magpieCard, quitCard);

    return {
      themeButtons: theme.buttons,
      languageSelect,
      alwaysOnTop,
      autostart,
      autostartError,
      hotkey,
      hotkeySave,
      hotkeyConfigError,
      hotkeyLocalError,
      port,
      portSave,
      portError,
      binaryPath,
      detected,
      browse,
      autoDetect,
      binaryLocalError,
      dataDir,
      avatarDir,
      appVersion,
      quit,
    };
  }

  function segmented(
    label: string,
    values: { value: string; label: string }[],
    onPick: (value: string) => void,
  ): Segment {
    const wrap = h("div", {
      class: "segmented",
      attrs: { role: "group", "aria-label": label },
    });
    const buttons: Record<string, HTMLButtonElement> = {};
    for (const item of values) {
      const button = h("button", {
        class: "seg-btn",
        type: "button",
        text: item.label,
        attrs: { "aria-pressed": "false" },
      });
      button.addEventListener("click", () => onPick(item.value));
      buttons[item.value] = button;
      wrap.append(button);
    }
    return { el: wrap, buttons };
  }

  function settingsRow(label: string, control: HTMLElement): HTMLElement {
    return h(
      "div",
      { class: "settings-row" },
      h("span", { class: "settings-label", text: label }),
      control,
    );
  }

  function switchRow(
    input: HTMLInputElement,
    label: string,
    description: string,
  ): HTMLElement {
    return h(
      "label",
      { class: "switch-row" },
      h(
        "span",
        { class: "switch-text" },
        h("span", { class: "switch-label", text: label }),
        h("span", { class: "switch-desc", text: description }),
      ),
      input,
      h("span", { class: "switch-track", attrs: { "aria-hidden": "true" } }),
    );
  }

  function kv(label: string, value: HTMLElement): HTMLElement {
    return h("div", { class: "kv" }, h("dt", { text: label }), value);
  }

  function setPressed(
    buttons: Record<string, HTMLButtonElement>,
    value: string,
  ): void {
    for (const [key, button] of Object.entries(buttons)) {
      button.setAttribute("aria-pressed", String(key === value));
    }
  }

  function setError(target: HTMLElement, message: string): void {
    setText(target, message);
    setHidden(target, !message);
  }

  async function chooseTheme(value: string): Promise<void> {
    const current = ctx.getState()?.config.theme ?? getThemeMode();
    if (value === current) {
      setPressed(refs.themeButtons, value);
      return;
    }
    themePending = value;
    applyTheme(value);
    setPressed(refs.themeButtons, value);
    try {
      await ctx.saveConfig({ theme: value });
    } catch (err) {
      applyTheme(current);
      setPressed(refs.themeButtons, current);
      ctx.errorToast(err);
    } finally {
      themePending = null;
      update();
    }
  }

  async function chooseLanguage(value: string): Promise<void> {
    const previous = getLanguage();
    if (value === previous) return;
    ctx.applyLanguage(value, true);
    try {
      await ctx.saveConfig({ language: value });
    } catch (err) {
      ctx.applyLanguage(previous);
      ctx.errorToast(err);
    }
  }

  async function saveToggle(
    key: "alwaysOnTop" | "autostart",
    input: HTMLInputElement,
  ): Promise<void> {
    const desired = input.checked;
    input.disabled = true;
    try {
      await ctx.saveConfig(
        key === "alwaysOnTop" ? { alwaysOnTop: desired } : { autostart: desired },
      );
    } catch (err) {
      input.checked = !desired;
      ctx.errorToast(err);
    } finally {
      input.disabled = false;
      update();
    }
  }

  async function saveHotkey(): Promise<void> {
    const value = refs.hotkey.value.trim();
    setError(refs.hotkeyLocalError, "");
    if (!value) {
      setError(refs.hotkeyLocalError, t("settings.hotkeyEmpty"));
      refs.hotkey.focus();
      return;
    }

    refs.hotkey.disabled = true;
    refs.hotkeySave.disabled = true;
    try {
      const config = await ctx.saveConfig({ hotkey: value });
      hotkeyDirty = false;
      refs.hotkey.value = config.hotkey;
      ctx.toast(t("common.saved"), "success");
    } catch (err) {
      setError(
        refs.hotkeyLocalError,
        errorMessage(err) || t("settings.saveFailed"),
      );
      ctx.errorToast(err);
    } finally {
      refs.hotkey.disabled = false;
      refs.hotkeySave.disabled = false;
    }
  }

  async function savePort(): Promise<void> {
    const raw = refs.port.value.trim();
    const value = Number(raw);
    if (raw === "" || !Number.isInteger(value) || value < 0 || value > 65535) {
      setError(refs.portError, t("settings.portInvalid"));
      refs.port.focus();
      return;
    }
    setError(refs.portError, "");

    refs.port.disabled = true;
    refs.portSave.disabled = true;
    try {
      const config = await ctx.saveConfig({ port: value });
      portDirty = false;
      refs.port.value = String(config.port);
      ctx.toast(t("common.saved"), "success");
    } catch (err) {
      setError(refs.portError, errorMessage(err) || t("settings.saveFailed"));
      ctx.errorToast(err);
    } finally {
      refs.port.disabled = false;
      refs.portSave.disabled = false;
    }
  }

  async function browseBinary(): Promise<void> {
    setError(refs.binaryLocalError, "");
    refs.browse.disabled = true;
    try {
      const before = ctx.getState()?.config.binaryPath ?? "";
      const config = await PanelService.chooseBinary();
      ctx.applyConfig(config);
      if (config.binaryPath !== before) {
        ctx.toast(t("common.saved"), "success");
      }
    } catch (err) {
      setError(refs.binaryLocalError, errorMessage(err) || t("common.error"));
      ctx.errorToast(err);
    } finally {
      refs.browse.disabled = false;
    }
  }

  async function autoDetectBinary(): Promise<void> {
    setError(refs.binaryLocalError, "");
    refs.autoDetect.disabled = true;
    try {
      await ctx.saveConfig({ binaryPath: "" });
      ctx.toast(t("common.saved"), "success");
    } catch (err) {
      setError(refs.binaryLocalError, errorMessage(err) || t("common.error"));
      ctx.errorToast(err);
    } finally {
      refs.autoDetect.disabled = false;
    }
  }

  async function quitApp(): Promise<void> {
    if (!window.confirm(t("settings.quitConfirm"))) return;
    try {
      await PanelService.quit();
    } catch (err) {
      ctx.errorToast(err);
    }
  }

  function update(): void {
    const state = ctx.getState();
    const config = state?.config;

    const themeValue = themePending ?? config?.theme ?? getThemeMode();
    setPressed(refs.themeButtons, themeValue);
    refs.languageSelect.value = getLanguage();

    if (!config) {
      refs.alwaysOnTop.checked = false;
      refs.autostart.checked = false;
      setError(refs.autostartError, "");
      setError(refs.hotkeyConfigError, "");
      setText(refs.binaryPath, "—");
      setText(refs.detected, "—");
      setText(refs.dataDir, "—");
      setText(refs.avatarDir, "—");
      setText(refs.appVersion, "—");
      return;
    }

    if (!refs.alwaysOnTop.disabled) refs.alwaysOnTop.checked = config.alwaysOnTop;
    if (!refs.autostart.disabled) refs.autostart.checked = config.autostart;
    setError(refs.autostartError, config.autostartError);
    if (
      !hotkeyDirty &&
      document.activeElement !== refs.hotkey
    ) {
      refs.hotkey.value = config.hotkey;
    }
    setError(refs.hotkeyConfigError, config.hotkeyError);
    if (!portDirty && document.activeElement !== refs.port) {
      refs.port.value = String(config.port);
    }

    setText(refs.binaryPath, config.binaryPath || "—");
    refs.binaryPath.classList.toggle("is-empty", !config.binaryPath);
    setText(refs.detected, config.detectedBinary || t("settings.notFound"));
    refs.detected.classList.toggle("warn", !config.detectedBinary);
    setText(refs.dataDir, config.dataDir || "—");
    setText(refs.avatarDir, config.avatarDir || "—");
    setText(refs.appVersion, config.version || "—");
  }

  return {
    el,
    update,
    rebuild: () => {
      const hotkeyValue = refs.hotkey.value;
      const portValue = refs.port.value;
      refs = build();
      if (hotkeyDirty) refs.hotkey.value = hotkeyValue;
      if (portDirty) refs.port.value = portValue;
      update();
    },
  };
}
