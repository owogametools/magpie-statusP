import { PanelService, type AgentView, type ModelOptionView } from "../mygo";
import { clear, h, setDisabled, setHidden, setText } from "../dom";
import { errorMessage } from "../errors";
import { icon } from "../icons";
import { agentName, effortFieldLabel, t } from "../i18n";
import type { AppContext, TabView } from "../types";

interface Refs {
  hint: HTMLElement;
  list: HTMLElement;
  count: HTMLElement;
  refreshBtn: HTMLButtonElement;
}

interface Choice {
  model: string;
  effort: string;
  touched: boolean;
}

export function createAgentsTab(ctx: AppContext): TabView {
  const el = h("div", { class: "agents" });

  let agents: AgentView[] = [];
  let loaded = false;
  let loading = false;
  let reloadQueued = false;
  let error = "";
  let detailSeq = 0;
  let lastShowHint = false;

  const expanded = new Set<string>();
  const models = new Map<string, ModelOptionView[]>();
  const modelsLoading = new Set<string>();
  const modelsError = new Map<string, string>();
  const choices = new Map<string, Choice>();
  const applying = new Set<string>();
  const detailEls = new Map<string, HTMLElement>();

  let refs = build();
  renderList();

  function build(): Refs {
    clear(el);

    const count = h("span", { class: "section-count" });
    const refreshBtn = h(
      "button",
      {
        class: "icon-btn",
        type: "button",
        attrs: { "aria-label": t("common.refresh"), title: t("common.refresh") },
        on: { click: () => void load(true) },
      },
      icon("refresh"),
    );

    const hint = h(
      "div",
      { class: "card hint-card", hidden: true },
      icon("warning"),
      h(
        "div",
        { class: "hint-copy" },
        h("div", { class: "hint-title", text: t("agents.binaryMissing") }),
      ),
      h("button", {
        class: "btn small",
        type: "button",
        text: t("agents.goSettings"),
        on: { click: () => ctx.navigate("settings") },
      }),
    );

    const list = h("div", { class: "agent-list" });

    el.append(
      h(
        "div",
        { class: "agents-head" },
        h("div", { class: "section-title", text: t("agents.title") }),
        count,
        h("span", { class: "spacer" }),
        refreshBtn,
      ),
      hint,
      list,
    );

    return { hint, list, count, refreshBtn };
  }

  function update(): void {
    const state = ctx.getState();
    const hasBinary = Boolean(state?.config.detectedBinary);
    const showHint = Boolean(state) && !hasBinary && !loaded && !loading;

    setHidden(refs.hint, !showHint);
    if (showHint !== lastShowHint) {
      lastShowHint = showHint;
      renderList();
    }

    setText(refs.count, agents.length > 0 ? String(agents.length) : "");
    setHidden(refs.count, agents.length === 0);
    setDisabled(refs.refreshBtn, loading);
    refs.refreshBtn.classList.toggle("busy", loading);

    if (state && hasBinary && !loaded && !loading && !error) {
      void load(false);
    }
  }

  async function load(clearModels: boolean): Promise<void> {
    if (loading) {
      reloadQueued = true;
      return;
    }
    loading = true;
    error = "";
    if (clearModels) {
      models.clear();
      modelsError.clear();
    }
    renderList();
    updateChrome();
    try {
      agents = await PanelService.getAgents();
      loaded = true;
    } catch (err) {
      error = errorMessage(err) || t("agents.loadError");
    } finally {
      loading = false;
      renderList();
      updateChrome();
      if (reloadQueued) {
        reloadQueued = false;
        void load(true);
      }
    }
  }

  function updateChrome(): void {
    setText(refs.count, agents.length > 0 ? String(agents.length) : "");
    setHidden(refs.count, agents.length === 0);
    setDisabled(refs.refreshBtn, loading);
    refs.refreshBtn.classList.toggle("busy", loading);
  }

  function renderList(): void {
    clear(refs.list);
    detailEls.clear();

    if ((loading || !ctx.getState()) && agents.length === 0) {
      refs.list.append(loadingBlock());
      return;
    }
    if (error && agents.length === 0) {
      refs.list.append(errorBlock());
      return;
    }
    if (agents.length === 0) {
      if (loaded) {
        refs.list.append(h("div", { class: "empty", text: t("agents.empty") }));
      }
      return;
    }

    for (const agent of agents) refs.list.append(agentCard(agent));
    if (error) {
      refs.list.append(
        h("p", { class: "field-error inline-error", text: error }),
      );
    }
  }

  function loadingBlock(): HTMLElement {
    return h(
      "div",
      { class: "card loading-card" },
      h("span", { class: "spinner", attrs: { "aria-hidden": "true" } }),
      h("span", { text: t("common.loading") }),
    );
  }

  function errorBlock(): HTMLElement {
    return h(
      "div",
      { class: "card hint-card" },
      icon("warning"),
      h(
        "div",
        { class: "hint-copy" },
        h("div", { class: "hint-title", text: t("agents.loadError") }),
        h("div", { class: "hint-detail", text: error }),
      ),
      h("button", {
        class: "btn small",
        type: "button",
        text: t("common.retry"),
        on: { click: () => void load(true) },
      }),
    );
  }

  function agentLabel(agent: AgentView): string {
    return agent.name || agentName(agent.key);
  }

  function agentCard(agent: AgentView): HTMLElement {
    const card = h("div", { class: "card agent-card" });
    const detailId = `agent-detail-${detailSeq++}`;
    const isOpen = expanded.has(agent.name);

    const effortLabel = effortFieldLabel(agent.effortField || "effort");
    const effort = agent.effort
      ? h("span", {
          class: "chip muted agent-effort",
          text: `${effortLabel} ${agent.effort}`,
          title: `${effortLabel}: ${agent.effort}`,
        })
      : null;

    const row = h(
      "button",
      {
        class: "agent-row",
        type: "button",
        attrs: {
          "aria-expanded": String(isOpen),
          "aria-controls": detailId,
        },
      },
      h("span", { class: "agent-caret" }, icon("chevronRight")),
      h("span", { class: "agent-name", text: agentLabel(agent) }),
      h("span", {
        class: "agent-model",
        text: agent.model || "—",
        title: agent.model,
      }),
      effort,
    );
    card.append(row);

    let detail: HTMLElement | null = null;
    if (isOpen) {
      detail = makeDetail(agent, detailId);
      card.append(detail);
      detailEls.set(agent.name, detail);
      void ensureModels(agent);
    }

    row.addEventListener("click", () => {
      const open = !expanded.has(agent.name);
      if (open) expanded.add(agent.name);
      else expanded.delete(agent.name);
      row.setAttribute("aria-expanded", String(open));

      if (open) {
        if (!detail) {
          detail = makeDetail(agent, detailId);
          card.append(detail);
          detailEls.set(agent.name, detail);
        }
        detail.hidden = false;
        void ensureModels(agent);
      } else if (detail) {
        detail.hidden = true;
      }
    });

    return card;
  }

  function makeDetail(agent: AgentView, id: string): HTMLElement {
    const detail = h("div", {
      class: "agent-detail",
      attrs: { id, role: "region", "aria-label": agentLabel(agent) },
    });
    renderDetail(detail, agent);
    return detail;
  }

  function renderDetail(detail: HTMLElement, agent: AgentView): void {
    clear(detail);
    const choice = choiceFor(agent);
    const catalog = models.get(agent.name);
    const loadingModels = modelsLoading.has(agent.name);
    const modelError = modelsError.get(agent.name) || "";

    if (catalog && choice.model && !catalog.some((m) => m.id === choice.model)) {
      choice.model = "";
    }

    const modelField = h("div", { class: "field" });
    modelField.append(
      h("label", { class: "field-label", text: t("agents.model") }),
    );
    const modelSelect = h("select", { class: "select" });

    if (loadingModels) {
      modelSelect.disabled = true;
      modelSelect.append(h("option", { text: t("agents.loadingModels") }));
    } else if (catalog) {
      modelSelect.append(
        h("option", { value: "", text: t("agents.selectModel") }),
      );
      for (const model of catalog) {
        modelSelect.append(
          h("option", { value: model.id, text: model.name || model.id }),
        );
      }
      modelSelect.value = choice.model;
      modelSelect.addEventListener("change", () => {
        choice.model = modelSelect.value;
        choice.effort = "";
        choice.touched = true;
        renderDetail(detail, agent);
      });
    } else {
      modelSelect.disabled = true;
      modelSelect.append(h("option", { text: t("agents.noModels") }));
    }
    modelField.append(modelSelect);

    if (modelError) {
      modelField.append(h("p", { class: "field-error", text: modelError }));
      modelField.append(
        h("button", {
          class: "btn small",
          type: "button",
          text: t("common.retry"),
          on: { click: () => void ensureModels(agent, true) },
        }),
      );
    }

    const effortField = h("div", { class: "field" });
    effortField.append(
      h("label", { class: "field-label", text: t("agents.effort") }),
    );
    const effortSelect = h("select", { class: "select" });
    effortSelect.append(h("option", { value: "", text: "—" }));
    const levels = levelsFor(agent, choice.model);
    for (const level of levels) {
      effortSelect.append(h("option", { value: level, text: level }));
    }
    if (catalog && choice.effort && !levels.includes(choice.effort)) {
      choice.effort = "";
    }
    effortSelect.value = choice.effort;
    effortSelect.disabled = !catalog || levels.length === 0;
    effortSelect.addEventListener("change", () => {
      choice.effort = effortSelect.value;
    });
    effortField.append(effortSelect);

    const busy = applying.has(agent.name);
    const apply = h("button", {
      class: "btn primary",
      type: "button",
      text: busy ? t("agents.applying") : t("agents.apply"),
      disabled: busy || !choice.model,
    });
    apply.addEventListener("click", () => void applyChoice(agent, detail));

    detail.append(
      modelField,
      effortField,
      h("div", { class: "field-inline" }, apply),
      h("p", {
        class: "field-hint",
        text: `${t("agents.current")}: ${agent.model || "—"}`,
      }),
    );

    if (agent.details.length > 0) {
      detail.append(
        h("p", { class: "field-hint", text: agent.details.join(" · ") }),
      );
    }
    if (agent.path) {
      detail.append(
        h("p", {
          class: "field-hint mono selectable",
          text: agent.path,
          title: agent.path,
        }),
      );
    }
  }

  function choiceFor(agent: AgentView): Choice {
    let choice = choices.get(agent.name);
    if (!choice) {
      choice = { model: "", effort: agent.effort || "", touched: false };
      choices.set(agent.name, choice);
    }

    const catalog = models.get(agent.name);
    if (catalog) {
      if (!choice.touched) {
        const match = catalog.find(
          (m) => m.id === agent.model || m.name === agent.model,
        );
        if (match) choice.model = match.id;
      }
      if (choice.model && !catalog.some((m) => m.id === choice.model)) {
        choice.model = "";
      }
    }
    return choice;
  }

  function levelsFor(agent: AgentView, modelId: string): string[] {
    if (!modelId) return [];
    const catalog = models.get(agent.name);
    const found = catalog?.find((m) => m.id === modelId);
    return found?.levels ?? [];
  }

  async function ensureModels(agent: AgentView, force = false): Promise<void> {
    if (modelsLoading.has(agent.name)) return;
    if (!force && models.has(agent.name)) {
      refreshDetail(agent);
      return;
    }
    if (force) {
      models.delete(agent.name);
      modelsError.delete(agent.name);
    }

    modelsLoading.add(agent.name);
    refreshDetail(agent);
    try {
      const list = await PanelService.getModels(agent.name);
      models.set(agent.name, list);
      modelsError.delete(agent.name);
      choiceFor(agent);
    } catch (err) {
      modelsError.set(agent.name, errorMessage(err));
    } finally {
      modelsLoading.delete(agent.name);
      refreshDetail(agent);
    }
  }

  function refreshDetail(agent: AgentView): void {
    const detail = detailEls.get(agent.name);
    if (detail) renderDetail(detail, agent);
  }

  async function applyChoice(
    agent: AgentView,
    detail: HTMLElement,
  ): Promise<void> {
    const choice = choiceFor(agent);
    if (!choice.model || applying.has(agent.name)) return;

    applying.add(agent.name);
    renderDetail(detail, agent);
    try {
      const message = await PanelService.pickModel(
        agent.name,
        choice.model,
        choice.effort,
      );
      choice.touched = false;
      applying.delete(agent.name);
      ctx.toast(t("agents.applied", { message: message || "✓" }), "success");
      await load(true);
    } catch (err) {
      applying.delete(agent.name);
      ctx.errorToast(err);
      if (detail.isConnected) renderDetail(detail, agent);
      updateChrome();
    }
  }

  return {
    el,
    update,
    rebuild: () => {
      refs = build();
      renderList();
      update();
    },
  };
}
