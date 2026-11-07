import {
  PanelService,
  type AvatarStateView,
  type StateView,
} from "../mygo";
import { clear, h, setDisabled, setHidden, setText } from "../dom";
import { errorMessage } from "../errors";
import { icon, placeholderSvg } from "../icons";
import { agentName, stateLabel, t } from "../i18n";
import { stateTone } from "../format";
import type { AppContext, TabView } from "../types";

interface Refs {
  stage: HTMLElement;
  img: HTMLImageElement;
  placeholder: HTMLElement;
  metaAgent: HTMLElement;
  metaState: HTMLElement;
  metaSource: HTMLElement;
  immersiveBtn: HTMLButtonElement;
  agentSelect: HTMLSelectElement;
  defaultSelect: HTMLSelectElement;
  orderList: HTMLElement;
  statesHead: HTMLElement;
  statesTitle: HTMLElement;
  stateGrid: HTMLElement;
  empty: HTMLElement;
}

export function createAvatarTab(ctx: AppContext): TabView {
  const el = h("div", { class: "avatar" });

  let selectedAgent = "";
  let currentUrl = "";
  let failedUrl = "";
  let preloadToken = 0;
  let statesSig = "";
  let orderSig = "";
  let orderBusy = false;
  let defaultBusy = false;
  const busyStates = new Set<string>();

  let refs = build();

  function build(): Refs {
    clear(el);

    const img = h("img", {
      class: "avatar-img",
      attrs: { alt: "", decoding: "async" },
    });
    img.hidden = true;

    const placeholder = h("div", {
      class: "avatar-placeholder",
      attrs: { "aria-hidden": "true" },
    });

    const stage = h(
      "div",
      { class: "avatar-stage", attrs: { role: "img" } },
      img,
      placeholder,
    );

    const metaAgent = h("span", { class: "chip muted" });
    const metaState = h("span", { class: "chip muted" });
    const metaSource = h("span", { class: "avatar-source" });

    const immersiveBtn = h("button", {
      class: "btn small ghost",
      type: "button",
    });
    immersiveBtn.addEventListener("click", () => {
      ctx.setImmersive(!ctx.isImmersive());
    });

    const agentSelect = h("select", {
      class: "select",
      attrs: { "aria-label": t("avatar.agent") },
    });
    agentSelect.addEventListener("change", () => {
      selectedAgent = agentSelect.value;
      statesSig = "";
      update();
    });

    const defaultSelect = h("select", {
      class: "select",
      attrs: { "aria-label": t("avatar.defaultSet") },
    });
    defaultSelect.addEventListener("change", () => {
      void saveDefault(defaultSelect.value);
    });

    const orderList = h("div", { class: "order-list" });

    const statesTitle = h("div", { class: "section-title" });
    const statesHead = h(
      "div",
      { class: "section-head" },
      statesTitle,
    );
    const stateGrid = h("div", { class: "state-grid" });
    const empty = h("div", { class: "empty", text: t("avatar.empty") });

    el.append(
      h(
        "div",
        { class: "avatar-preview" },
        stage,
        h(
          "div",
          { class: "avatar-meta" },
          metaAgent,
          metaState,
          metaSource,
          immersiveBtn,
        ),
      ),
      h(
        "div",
        { class: "card avatar-controls" },
        h(
          "div",
          { class: "field" },
          h("label", { class: "field-label", text: t("avatar.agent") }),
          agentSelect,
        ),
        h(
          "div",
          { class: "field" },
          h("label", { class: "field-label", text: t("avatar.defaultSet") }),
          defaultSelect,
          h("p", {
            class: "field-hint",
            text: t("avatar.defaultSetHint"),
          }),
        ),
      ),
      h(
        "div",
        { class: "card pad order-card" },
        h("div", { class: "card-title", text: t("avatar.order") }),
        h("p", { class: "field-hint", text: t("avatar.orderHint") }),
        orderList,
      ),
      statesHead,
      stateGrid,
      empty,
    );

    return {
      stage,
      img,
      placeholder,
      metaAgent,
      metaState,
      metaSource,
      immersiveBtn,
      agentSelect,
      defaultSelect,
      orderList,
      statesHead,
      statesTitle,
      stateGrid,
      empty,
    };
  }

  function renderImmersive(): void {
    const active = ctx.isImmersive();
    el.classList.toggle("is-immersive", active);
    const label = t(active ? "avatar.exitImmersive" : "avatar.immersive");
    setText(refs.immersiveBtn, label);
    refs.immersiveBtn.setAttribute("aria-label", label);
  }

  function update(): void {
    renderImmersive();
    const state = ctx.getState();
    if (!state) {
      setText(refs.metaAgent, "—");
      setText(refs.metaState, stateLabel("offline"));
      refs.metaState.className = "chip bad";
      setText(refs.metaSource, "");
      refs.stage.setAttribute("aria-label", t("common.loading"));
      showPlaceholder("offline");
      setDisabled(refs.agentSelect, true);
      setDisabled(refs.defaultSelect, true);
      setHidden(refs.statesHead, true);
      setHidden(refs.stateGrid, true);
      setHidden(refs.empty, false);
      setText(refs.empty, t("common.loading"));
      return;
    }

    const agents = agentList(state);
    if (!selectedAgent || !agents.includes(selectedAgent)) {
      selectedAgent = agents.includes(state.avatar.agent)
        ? state.avatar.agent
        : agents[0] ?? "";
    }

    setOptions(refs.agentSelect, agents, selectedAgent);
    setOptions(
      refs.defaultSelect,
      agents,
      state.config.defaultSet || state.defaultSet,
    );
    setDisabled(refs.agentSelect, agents.length === 0);
    setDisabled(refs.defaultSelect, agents.length === 0 || defaultBusy);

    renderStage(state);
    renderOrder(state, agents);
    renderStates(state, agents);
  }

  function agentList(state: StateView): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (raw: string | undefined): void => {
      const key = (raw ?? "").trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(key);
    };
    const order = state.config.agentOrder.length
      ? state.config.agentOrder
      : state.agentOrder;
    for (const agent of order) add(agent);
    for (const set of state.avatarSets) add(set.agent);
    add(state.defaultSet);
    add(state.avatar.agent);
    return out;
  }

  function setOptions(
    select: HTMLSelectElement,
    values: string[],
    current: string,
  ): void {
    const sig = values.join("\u0000");
    if (select.getAttribute("data-options") !== sig) {
      select.textContent = "";
      for (const value of values) {
        select.append(h("option", { value, text: agentName(value) }));
      }
      select.setAttribute("data-options", sig);
    }
    if (values.includes(current) && select.value !== current) {
      select.value = current;
    }
  }

  function renderStage(state: StateView): void {
    const avatar = state.avatar;
    const label = avatar.agent
      ? agentName(avatar.agent)
      : selectedAgent
        ? agentName(selectedAgent)
        : "—";
    const stateText = stateLabel(avatar.state);

    setText(refs.metaAgent, label);
    setText(refs.metaState, stateText);
    refs.metaState.className = `chip ${stateTone(avatar.state)}`;

    let source: string;
    if (!avatar.hasImage) {
      source = t("avatar.noImage");
    } else if (avatar.own) {
      source = t("avatar.ownSet", { agent: agentName(avatar.agent) });
    } else {
      source = t("avatar.fallbackSet", { set: agentName(avatar.set) });
    }
    setText(refs.metaSource, source);
    refs.stage.setAttribute(
      "aria-label",
      t("avatar.previewAlt", { agent: label, state: stateText }),
    );

    const url = avatar.url;
    if (!url) {
      preloadToken++;
      currentUrl = "";
      failedUrl = "";
      refs.img.hidden = true;
      refs.img.removeAttribute("src");
      showPlaceholder(avatar.state);
      return;
    }

    if (url === currentUrl) {
      refs.img.hidden = false;
      refs.placeholder.hidden = true;
      return;
    }

    if (url === failedUrl) {
      refs.img.hidden = true;
      refs.img.removeAttribute("src");
      showPlaceholder(avatar.state);
      return;
    }

    const token = ++preloadToken;
    const loader = new Image();
    loader.onload = (): void => {
      if (token !== preloadToken) return;
      currentUrl = url;
      failedUrl = "";
      refs.img.src = url;
      refs.img.hidden = false;
      refs.placeholder.hidden = true;
    };
    loader.onerror = (): void => {
      if (token !== preloadToken) return;
      currentUrl = "";
      failedUrl = url;
      refs.img.hidden = true;
      refs.img.removeAttribute("src");
      showPlaceholder(avatar.state);
    };
    loader.src = url;
  }

  function showPlaceholder(avatarState: string): void {
    refs.placeholder.hidden = false;
    if (refs.placeholder.getAttribute("data-state") === avatarState) return;
    refs.placeholder.setAttribute("data-state", avatarState);
    refs.placeholder.innerHTML = placeholderSvg(avatarState);
  }

  function renderOrder(state: StateView, agents: string[]): void {
    const sig = `${agents.join("\u0000")}|${state.defaultSet}|${orderBusy}`;
    if (sig === orderSig) return;
    orderSig = sig;

    clear(refs.orderList);
    agents.forEach((agent, index) => {
      const up = h(
        "button",
        {
          class: "icon-btn tiny",
          type: "button",
          attrs: { "aria-label": t("common.up"), title: t("common.up") },
          disabled: orderBusy || index === 0,
          on: { click: () => void moveAgent(index, -1) },
        },
        icon("arrowUp"),
      );
      const down = h(
        "button",
        {
          class: "icon-btn tiny",
          type: "button",
          attrs: { "aria-label": t("common.down"), title: t("common.down") },
          disabled: orderBusy || index === agents.length - 1,
          on: { click: () => void moveAgent(index, 1) },
        },
        icon("arrowDown"),
      );

      refs.orderList.append(
        h(
          "div",
          { class: "order-row" },
          h("span", { class: "order-rank", text: String(index + 1) }),
          h("span", { class: "order-name", text: agentName(agent) }),
          agent === state.defaultSet
            ? h("span", {
                class: "badge amber",
                text: t("avatar.badgeDefault"),
              })
            : null,
          h("div", { class: "order-actions" }, up, down),
        ),
      );
    });
  }

  async function moveAgent(index: number, delta: number): Promise<void> {
    if (orderBusy) return;
    const state = ctx.getState();
    if (!state) return;
    const list = agentList(state);
    const target = index + delta;
    const from = list[index];
    const to = list[target];
    if (!from || !to) return;
    list[index] = to;
    list[target] = from;

    orderBusy = true;
    orderSig = "";
    update();
    try {
      await ctx.saveConfig({ agentOrder: list });
    } catch (err) {
      ctx.errorToast(err);
    } finally {
      orderBusy = false;
      orderSig = "";
      update();
    }
  }

  async function saveDefault(value: string): Promise<void> {
    if (!value || defaultBusy) return;
    defaultBusy = true;
    setDisabled(refs.defaultSelect, true);
    try {
      await ctx.saveConfig({ defaultSet: value });
    } catch (err) {
      ctx.errorToast(err);
      const fallback = ctx.getState()?.config.defaultSet;
      if (fallback) refs.defaultSelect.value = fallback;
    } finally {
      defaultBusy = false;
      update();
    }
  }

  function renderStates(state: StateView, agents: string[]): void {
    const set = state.avatarSets.find((item) => item.agent === selectedAgent);
    const sig = `${selectedAgent}|${state.defaultSet}|${JSON.stringify(
      set?.states ?? [],
    )}`;
    if (sig === statesSig) return;
    statesSig = sig;

    setText(
      refs.statesTitle,
      t("avatar.states", { agent: agentName(selectedAgent) }),
    );
    setHidden(refs.statesHead, agents.length === 0);
    setHidden(refs.stateGrid, !set);
    setHidden(refs.empty, Boolean(set));
    if (!set) {
      setText(refs.empty, t("avatar.empty"));
      clear(refs.stateGrid);
      return;
    }

    clear(refs.stateGrid);
    for (const avatarState of set.states) {
      refs.stateGrid.append(stateCard(avatarState));
    }
  }

  function stateCard(avatarState: AvatarStateView): HTMLElement {
    const key = `${selectedAgent}\u0000${avatarState.state}`;
    const busy = busyStates.has(key);
    const own = avatarState.ownUrl;
    const shown = own || avatarState.url;

    const thumb = h("div", { class: "state-thumb" });
    if (shown) {
      thumb.append(
        h("img", {
          attrs: {
            src: shown,
            alt: stateLabel(avatarState.state),
            loading: "lazy",
            decoding: "async",
          },
        }),
      );
    } else {
      thumb.innerHTML = placeholderSvg(avatarState.state);
    }

    const badges: HTMLElement[] = [];
    if (own) {
      badges.push(h("span", { class: "badge ok", text: t("avatar.badgeOwn") }));
    } else if (avatarState.hasImage) {
      badges.push(
        h("span", { class: "badge amber", text: t("avatar.badgeDefault") }),
      );
    } else {
      badges.push(
        h("span", { class: "badge bad", text: t("avatar.badgeMissing") }),
      );
    }

    const choose = h("button", {
      class: "btn small",
      type: "button",
      text: t("avatar.choose"),
      disabled: busy,
      attrs: {
        "aria-label": `${t("avatar.choose")} — ${stateLabel(
          avatarState.state,
        )}`,
      },
    });
    choose.addEventListener("click", () => {
      void chooseImage(avatarState.state);
    });

    const remove = h("button", {
      class: "btn small ghost",
      type: "button",
      text: t("avatar.clear"),
      disabled: busy || !own,
      attrs: {
        "aria-label": `${t("avatar.clear")} — ${stateLabel(
          avatarState.state,
        )}`,
      },
    });
    remove.addEventListener("click", () => {
      void clearImage(avatarState.state);
    });

    return h(
      "div",
      { class: "state-card" },
      thumb,
      h(
        "div",
        { class: "state-head" },
        h("span", {
          class: "state-name",
          text: stateLabel(avatarState.state),
        }),
        ...badges,
      ),
      h("div", { class: "state-actions" }, choose, remove),
    );
  }

  function forceStates(): void {
    statesSig = "";
    update();
  }

  async function chooseImage(avatarState: string): Promise<void> {
    const agent = selectedAgent;
    if (!agent) return;
    const key = `${agent}\u0000${avatarState}`;
    if (busyStates.has(key)) return;

    busyStates.add(key);
    forceStates();
    try {
      const result = await PanelService.chooseAvatar(agent, avatarState);
      if (result.url || result.agent) {
        ctx.toast(t("avatar.changed"), "success");
      }
    } catch (err) {
      ctx.errorToast(errorMessage(err) || t("common.error"));
    } finally {
      busyStates.delete(key);
      forceStates();
    }
  }

  async function clearImage(avatarState: string): Promise<void> {
    const agent = selectedAgent;
    if (!agent) return;
    const key = `${agent}\u0000${avatarState}`;
    if (busyStates.has(key)) return;

    busyStates.add(key);
    forceStates();
    try {
      const next = await PanelService.clearAvatar(agent, avatarState);
      ctx.applyState(next);
      ctx.toast(t("avatar.cleared"), "success");
    } catch (err) {
      ctx.errorToast(err);
    } finally {
      busyStates.delete(key);
      forceStates();
    }
  }

  return {
    el,
    update,
    rebuild: () => {
      currentUrl = "";
      failedUrl = "";
      preloadToken++;
      statesSig = "";
      orderSig = "";
      refs = build();
      update();
    },
  };
}
