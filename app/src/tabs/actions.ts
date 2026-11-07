import { PanelService } from "../mygo";
import { clear, h, setHidden, setText } from "../dom";
import { icon, type IconName } from "../icons";
import { t, type MessageKey } from "../i18n";
import { timeOfDay } from "../format";
import type { AppContext, TabView } from "../types";

interface Refs {
  dot: HTMLElement;
  status: HTMLElement;
  version: HTMLElement;
  port: HTMLElement;
  updated: HTMLElement;
  error: HTMLElement;
}

export function createActionsTab(ctx: AppContext): TabView {
  const el = h("div", { class: "actions" });
  let refs = build();

  function build(): Refs {
    clear(el);

    const dot = h("span", { class: "dot off", attrs: { "aria-hidden": "true" } });
    const status = h("span", { class: "conn-status" });
    const version = h("dd", { text: "—" });
    const port = h("dd", { text: "—" });
    const updated = h("dd", { text: "—" });
    const error = h("p", { class: "field-error conn-error", hidden: true });

    const grid = h("div", { class: "action-grid" });
    action(
      grid,
      "window",
      "actions.openMagpie",
      "actions.openMagpieDesc",
      () => PanelService.openMagpie(),
    );
    action(
      grid,
      "panel",
      "actions.togglePanel",
      "actions.togglePanelDesc",
      () => PanelService.toggleMagpiePanel(),
    );
    action(
      grid,
      "refresh",
      "actions.refresh",
      "actions.refreshDesc",
      async () => {
        await ctx.refreshNow();
        ctx.toast(t("actions.refreshed"), "success");
      },
    );
    action(
      grid,
      "folder",
      "actions.dataFolder",
      "actions.dataFolderDesc",
      () => PanelService.openDataFolder(),
    );
    action(
      grid,
      "image",
      "actions.avatarFolder",
      "actions.avatarFolderDesc",
      () => PanelService.openAvatarFolder(),
    );
    action(
      grid,
      "external",
      "actions.releases",
      "actions.releasesDesc",
      () => PanelService.openReleases(),
    );

    const connection = h(
      "div",
      { class: "card conn-card" },
      h(
        "div",
        { class: "conn-head" },
        dot,
        h("span", { class: "conn-title", text: t("actions.connection") }),
        status,
      ),
      h(
        "dl",
        { class: "kv-list" },
        kv(t("actions.magpieVersion"), version),
        kv(t("common.port"), port),
        kv(t("common.updated"), updated),
      ),
      error,
    );

    el.append(
      h(
        "div",
        { class: "section-head" },
        h("div", { class: "section-title", text: t("actions.title") }),
      ),
      grid,
      connection,
    );

    return { dot, status, version, port, updated, error };
  }

  function action(
    grid: HTMLElement,
    iconName: IconName,
    labelKey: MessageKey,
    descKey: MessageKey,
    run: () => Promise<unknown>,
  ): void {
    grid.append(
      h(
        "button",
        {
          class: "action-btn",
          type: "button",
          on: { click: () => void runAction(run) },
        },
        h("span", { class: "action-icon" }, icon(iconName)),
        h("span", { class: "action-label", text: t(labelKey) }),
        h("span", { class: "action-desc", text: t(descKey) }),
      ),
    );
  }

  async function runAction(run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (err) {
      ctx.errorToast(err);
    }
  }

  function kv(label: string, value: HTMLElement): HTMLElement {
    return h("div", { class: "kv" }, h("dt", { text: label }), value);
  }

  function update(): void {
    const state = ctx.getState();
    const connected = state?.connected ?? false;

    refs.dot.className = connected ? "dot" : "dot off";
    refs.dot.title = connected ? t("common.online") : t("common.offline");
    setText(refs.status, connected ? t("common.online") : t("common.offline"));
    setText(refs.version, state?.version || "—");
    setText(refs.port, state && state.port > 0 ? String(state.port) : "—");
    setText(
      refs.updated,
      state?.updatedAt ? timeOfDay(state.updatedAt) : "—",
    );

    const detail = state?.error || "";
    setHidden(refs.error, !detail);
    setText(refs.error, detail);
  }

  return {
    el,
    update,
    rebuild: () => {
      refs = build();
      update();
    },
  };
}
