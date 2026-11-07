import type {
  BucketView,
  QuotaView,
  QuotaWindowView,
  RequestView,
  RouteView,
} from "../mygo";
import { clear, h, setHidden, setText } from "../dom";
import { icon } from "../icons";
import { agentName, phaseLabel, t } from "../i18n";
import {
  formatCompact,
  formatInt,
  formatMoney,
  formatMs,
  formatReset,
  fullDateTime,
  phaseTone,
  statusTone,
  timeOfDay,
  totalTokens,
  usedPercent,
} from "../format";
import type { AppContext, TabView } from "../types";

interface Refs {
  banner: HTMLElement;
  bannerTitle: HTMLElement;
  bannerDetail: HTMLElement;
  calls: HTMLElement;
  tokens: HTMLElement;
  tokensCard: HTMLElement;
  cost: HTMLElement;
  weekCalls: HTMLElement;
  weekCost: HTMLElement;
  quotaList: HTMLElement;
  quotaEmpty: HTMLElement;
  chart: HTMLElement;
  chartEmpty: HTMLElement;
  activeList: HTMLElement;
  activeEmpty: HTMLElement;
  activeCount: HTMLElement;
  reqList: HTMLElement;
  reqEmpty: HTMLElement;
}

export function createUsageTab(ctx: AppContext): TabView {
  const el = h("div", { class: "usage" });
  let quotaSig = "";
  let chartSig = "";
  let activeSig = "";
  let reqSig = "";
  let refs = build();

  function build(): Refs {
    clear(el);
    quotaSig = chartSig = activeSig = reqSig = "";

    const bannerTitle = h("div", { class: "banner-title" });
    const bannerDetail = h("div", { class: "banner-detail" });
    const retry = h("button", {
      class: "btn small",
      type: "button",
      text: t("common.retry"),
      on: {
        click: () => {
          void ctx.refreshNow().catch((err) => ctx.errorToast(err));
        },
      },
    });
    const banner = h(
      "div",
      { class: "banner", hidden: true },
      icon("warning"),
      h("div", { class: "banner-copy" }, bannerTitle, bannerDetail),
      retry,
    );

    const calls = h("div", { class: "stat-value", text: "—" });
    const tokens = h("div", { class: "stat-value", text: "—" });
    const cost = h("div", { class: "stat-value", text: "—" });
    const tokensCard = h(
      "div",
      { class: "stat" },
      h("div", { class: "stat-label", text: t("usage.todayTokens") }),
      tokens,
    );

    const weekCalls = h("div", { class: "week-calls", text: "—" });
    const weekCost = h("div", { class: "week-cost-value", text: "—" });

    const quotaList = h("div", { class: "stack" });
    const quotaEmpty = h("div", { class: "empty", text: t("usage.noQuotas") });

    const chart = h("div", { class: "chart" });
    const chartEmpty = h("div", { class: "empty", text: t("usage.noSeries") });

    const activeCount = h("span", { class: "section-count" });
    const activeList = h("div", { class: "card list" });
    const activeEmpty = h("div", { class: "empty", text: t("usage.noActive") });

    const reqList = h("div", { class: "card list" });
    const reqEmpty = h("div", { class: "empty", text: t("usage.noRequests") });

    el.append(
      banner,
      h(
        "div",
        { class: "stat-grid" },
        h(
          "div",
          { class: "stat" },
          h("div", { class: "stat-label", text: t("usage.todayCalls") }),
          calls,
        ),
        tokensCard,
        h(
          "div",
          { class: "stat" },
          h("div", { class: "stat-label", text: t("usage.todayCost") }),
          cost,
        ),
      ),
      h(
        "div",
        { class: "card week-card" },
        h(
          "div",
          { class: "week-block" },
          h("div", { class: "stat-label", text: t("usage.week") }),
          weekCalls,
        ),
        h(
          "div",
          { class: "week-block right" },
          h("div", { class: "stat-label", text: t("usage.cost") }),
          weekCost,
        ),
      ),
      sectionHead(t("usage.quotas")),
      quotaList,
      quotaEmpty,
      sectionHead(t("usage.weekChart")),
      h("div", { class: "card chart-card" }, chart, chartEmpty),
      sectionHead(
        t("usage.active"),
        h("span", { class: "dot live", attrs: { "aria-hidden": "true" } }),
        activeCount,
      ),
      activeList,
      activeEmpty,
      sectionHead(t("usage.recent")),
      reqList,
      reqEmpty,
    );

    return {
      banner,
      bannerTitle,
      bannerDetail,
      calls,
      tokens,
      tokensCard,
      cost,
      weekCalls,
      weekCost,
      quotaList,
      quotaEmpty,
      chart,
      chartEmpty,
      activeList,
      activeEmpty,
      activeCount,
      reqList,
      reqEmpty,
    };
  }

  function sectionHead(title: string, ...extra: HTMLElement[]): HTMLElement {
    return h(
      "div",
      { class: "section-head" },
      h("div", { class: "section-title", text: title }),
      ...extra,
    );
  }

  function update(): void {
    const s = ctx.getState();
    const connected = s?.connected ?? false;
    const detail = s?.error || ctx.getBootError();
    const showBanner = s ? !connected : Boolean(detail);

    setHidden(refs.banner, !showBanner);
    if (showBanner) {
      setText(refs.bannerTitle, t("banner.offlineTitle"));
      setText(refs.bannerDetail, detail || t("banner.offlineDetail"));
    }

    if (!s) {
      setText(refs.calls, "—");
      setText(refs.tokens, "—");
      setText(refs.cost, "—");
      setText(refs.weekCalls, "—");
      setText(refs.weekCost, "—");
      setText(refs.activeCount, "0");
      renderQuotas([]);
      renderChart([]);
      renderActive([]);
      renderRequests([]);
      return;
    }

    setText(refs.calls, formatInt(s.today.calls));
    setText(refs.tokens, formatCompact(totalTokens(s.today)));
    refs.tokensCard.title = t("usage.tokensBreakdown", {
      input: formatCompact(s.today.input),
      output: formatCompact(s.today.output),
    });
    setText(refs.cost, formatMoney(s.today.cost));
    setText(
      refs.weekCalls,
      t("usage.weekCalls", { count: formatInt(s.week.calls) }),
    );
    setText(refs.weekCost, formatMoney(s.week.cost));

    const nextQuota = JSON.stringify(s.quotas);
    if (nextQuota !== quotaSig) {
      quotaSig = nextQuota;
      renderQuotas(s.quotas);
    }

    const nextChart = JSON.stringify(s.week.series);
    if (nextChart !== chartSig) {
      chartSig = nextChart;
      renderChart(s.week.series);
    }

    const nextActive = JSON.stringify(s.active);
    if (nextActive !== activeSig) {
      activeSig = nextActive;
      renderActive(s.active);
    }

    const nextRequests = JSON.stringify(s.requests);
    if (nextRequests !== reqSig) {
      reqSig = nextRequests;
      renderRequests(s.requests);
    }
  }

  function renderQuotas(quotas: QuotaView[]): void {
    clear(refs.quotaList);
    setHidden(refs.quotaList, quotas.length === 0);
    setHidden(refs.quotaEmpty, quotas.length > 0);
    for (const quota of quotas) refs.quotaList.append(quotaCard(quota));
  }

  function quotaCard(quota: QuotaView): HTMLElement {
    const title = quota.name || quota.provider || t("common.unknown");
    const sub =
      quota.name && quota.provider && quota.name !== quota.provider
        ? quota.provider
        : quota.kind;
    const card = h(
      "div",
      { class: "card quota" },
      h(
        "div",
        { class: "quota-head" },
        h(
          "div",
          { class: "quota-titles" },
          h("div", { class: "quota-name", text: title }),
          sub ? h("div", { class: "quota-provider", text: sub }) : null,
        ),
        quota.plan ? h("span", { class: "badge amber", text: quota.plan }) : null,
      ),
    );
    for (const window of quota.windows) card.append(quotaWindow(window));
    if (quota.error) {
      card.append(h("p", { class: "field-error", text: quota.error }));
    }
    if (quota.windows.length === 0 && !quota.error) {
      card.append(h("div", { class: "empty small", text: t("usage.noQuotas") }));
    }
    return card;
  }

  function quotaWindow(window: QuotaWindowView): HTMLElement {
    const pct = usedPercent(window.used, window.remaining);
    const fill = h("div", { class: "bar-fill" });
    fill.style.width = `${pct.toFixed(1)}%`;
    if (pct >= 90) fill.classList.add("crit");
    else if (pct >= 70) fill.classList.add("warn");

    const bar = h(
      "div",
      {
        class: "bar",
        attrs: {
          role: "progressbar",
          "aria-valuemin": "0",
          "aria-valuemax": "100",
          "aria-valuenow": String(Math.round(pct)),
          "aria-label": window.name || t("usage.quotas"),
        },
      },
      fill,
    );

    const total = window.used + window.remaining;
    const amount =
      window.display ||
      t("usage.quotaNumbers", {
        used: formatCompact(window.used),
        total: formatCompact(total),
      });
    const reset = window.resetsAt
      ? t("usage.resets", { time: formatReset(window.resetsAt) })
      : "";

    return h(
      "div",
      { class: "quota-window" },
      h(
        "div",
        { class: "quota-row" },
        h("span", {
          class: "quota-label",
          text: window.name || t("usage.quotas"),
        }),
        h("span", { class: "quota-value", text: amount }),
      ),
      bar,
      h(
        "div",
        { class: "quota-meta" },
        h("span", {
          text: `${t("usage.quotaUsed", { pct: Math.round(pct) })} · ${t(
            "usage.quotaRemaining",
            { value: formatCompact(window.remaining) },
          )}`,
        }),
        reset
          ? h("span", {
              text: reset,
              title: fullDateTime(window.resetsAt),
            })
          : null,
      ),
    );
  }

  function renderChart(series: BucketView[]): void {
    clear(refs.chart);
    setHidden(refs.chart, series.length === 0);
    setHidden(refs.chartEmpty, series.length > 0);
    if (series.length === 0) return;

    let max = 0;
    for (const bucket of series) max = Math.max(max, bucket.calls);
    const peak = Math.max(1, max);
    const last = series.length - 1;

    series.forEach((bucket, index) => {
      const height =
        bucket.calls <= 0 ? 2 : Math.max(6, (bucket.calls / peak) * 100);
      const bar = h("div", { class: "chart-bar" });
      bar.style.height = `${height}%`;
      const label = bucket.label || bucket.time;
      refs.chart.append(
        h(
          "div",
          {
            class: `chart-col${index === last ? " is-today" : ""}`,
            title: t("usage.chartTitle", {
              label,
              count: formatInt(bucket.calls),
            }),
          },
          h("div", { class: "chart-value", text: formatCompact(bucket.calls) }),
          h("div", { class: "chart-track" }, bar),
          h("div", { class: "chart-label", text: label }),
        ),
      );
    });
  }

  function renderActive(routes: RouteView[]): void {
    clear(refs.activeList);
    setHidden(refs.activeList, routes.length === 0);
    setHidden(refs.activeEmpty, routes.length > 0);
    setText(refs.activeCount, String(routes.length));
    for (const route of routes) refs.activeList.append(activeRow(route));
  }

  function activeRow(route: RouteView): HTMLElement {
    const failed = route.failed || route.status >= 400;
    const chips: HTMLElement[] = [
      h("span", {
        class: `chip ${phaseTone(route.phase)}`,
        text: phaseLabel(route.phase),
      }),
    ];
    if (route.fallback) {
      chips.push(h("span", { class: "badge amber", text: t("usage.fallback") }));
    }
    if (failed) {
      chips.push(h("span", { class: "badge bad", text: t("usage.failed") }));
    }

    const meta: HTMLElement[] = [];
    if (route.attempt > 1) {
      meta.push(h("span", { text: t("usage.attempt", { n: route.attempt }) }));
    }
    if (route.ttft > 0) {
      meta.push(
        h("span", { text: t("usage.ttft", { time: formatMs(route.ttft) }) }),
      );
    }
    if (route.ms > 0) {
      meta.push(h("span", { text: formatMs(route.ms) }));
    }

    const subtitle = route.model || route.provider || "";
    return h(
      "div",
      { class: "list-row" },
      h(
        "div",
        { class: "row-head" },
        h("span", { class: "row-title", text: agentName(route.agent) }),
        h("span", { class: "row-sub", text: subtitle, title: subtitle }),
        ...chips,
      ),
      meta.length > 0 ? h("div", { class: "row-meta" }, ...meta) : null,
    );
  }

  function renderRequests(requests: RequestView[]): void {
    clear(refs.reqList);
    setHidden(refs.reqList, requests.length === 0);
    setHidden(refs.reqEmpty, requests.length > 0);
    for (const request of requests) refs.reqList.append(requestRow(request));
  }

  function requestRow(request: RequestView): HTMLElement {
    const model = request.model || request.requested || "—";
    const served =
      request.served && request.served !== model ? request.served : "";
    const tokens = request.in + request.out;
    const status = request.status > 0 ? String(request.status) : "—";

    const meta: (HTMLElement | null)[] = [
      h("span", { class: `chip ${statusTone(request.status)}`, text: status }),
      served
        ? h("span", {
            class: "req-served",
            text: `${t("usage.served")} ${served}`,
            title: served,
          })
        : null,
      request.effort
        ? h("span", { class: "chip muted", text: request.effort })
        : null,
      request.ms > 0 ? h("span", { text: formatMs(request.ms) }) : null,
      h("span", {
        text: `${formatCompact(tokens)} ${t("usage.tokenUnit")}`,
        title: t("usage.tokensBreakdown", {
          input: formatCompact(request.in),
          output: formatCompact(request.out),
        }),
      }),
    ];

    return h(
      "div",
      { class: "req-row" },
      h(
        "div",
        { class: "req-top" },
        h("span", { class: "req-agent", text: agentName(request.agent) }),
        h("span", { class: "req-model", text: model, title: model }),
        h("span", {
          class: "req-time",
          text: timeOfDay(request.time),
          title: fullDateTime(request.time),
        }),
      ),
      h("div", { class: "req-meta" }, ...meta),
    );
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
