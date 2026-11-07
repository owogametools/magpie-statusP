// Number, money and time formatting shared by every tab.

import { getLanguage } from "./i18n";

const intFormats = new Map<string, Intl.NumberFormat>();
const moneyFormats = new Map<string, Intl.NumberFormat>();

function intFormat(): Intl.NumberFormat {
  const lang = getLanguage();
  let f = intFormats.get(lang);
  if (!f) {
    f = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });
    intFormats.set(lang, f);
  }
  return f;
}

function moneyFormat(): Intl.NumberFormat {
  const lang = getLanguage();
  let f = moneyFormats.get(lang);
  if (!f) {
    f = new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    moneyFormats.set(lang, f);
  }
  return f;
}

export function formatInt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return intFormat().format(value);
}

/** Compact token counts, always with K/M/B so both languages read alike. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs < 1_000) return sign + String(Math.round(abs));

  const units: ReadonlyArray<readonly [number, string]> = [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "K"],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = abs / size;
      const digits = scaled >= 100 ? 0 : 1;
      return `${sign}${scaled.toFixed(digits).replace(/\.0$/, "")}${suffix}`;
    }
  }
  return sign + String(Math.round(abs));
}

export function formatMoney(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return `$${moneyFormat().format(n)}`;
}

export function totalTokens(usage: { input: number; output: number }): number {
  const input = Number.isFinite(usage.input) ? usage.input : 0;
  const output = Number.isFinite(usage.output) ? usage.output : 0;
  return Math.max(0, input) + Math.max(0, output);
}

export function usedPercent(used: number, remaining: number): number {
  const u = Number.isFinite(used) ? used : 0;
  const r = Number.isFinite(remaining) ? remaining : 0;
  const total = u + r;
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (u / total) * 100));
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function parseDate(raw: string): Date | null {
  const text = raw.trim();
  if (!text) return null;
  const millis = Date.parse(text);
  if (Number.isNaN(millis)) return null;
  return new Date(millis);
}

function clock(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** HH:mm:ss, from an RFC 3339 stamp or a time-only string. */
export function timeOfDay(raw: string): string {
  if (!raw) return "—";
  const d = parseDate(raw);
  if (d) return clock(d);
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (!m) return raw;
  return `${pad2(Number(m[1]))}:${m[2]}:${m[3] ?? "00"}`;
}

export function fullDateTime(raw: string): string {
  if (!raw) return "—";
  const d = parseDate(raw);
  if (!d) return raw;
  return new Intl.DateTimeFormat(getLanguage(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

/** A quota reset stamp: time when it is near, a date otherwise. */
export function formatReset(raw: string): string {
  if (!raw) return "—";
  const d = parseDate(raw);
  if (!d) return raw;
  const delta = d.getTime() - Date.now();
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const options: Intl.DateTimeFormatOptions =
    delta > 0 && delta < 24 * 60 * 60 * 1000
      ? { hour: "2-digit", minute: "2-digit" }
      : {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          ...(sameYear ? {} : { year: "numeric" }),
        };
  return new Intl.DateTimeFormat(getLanguage(), options).format(d);
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(/\.0$/, "")}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export type Tone = "ok" | "warn" | "bad" | "info" | "muted";

export function stateTone(state: string): Tone {
  switch (state.trim().toLowerCase()) {
    case "streaming":
      return "ok";
    case "routing":
      return "info";
    case "waiting":
    case "fallback":
      return "warn";
    case "failed":
    case "offline":
      return "bad";
    default:
      return "muted";
  }
}

export function phaseTone(phase: string): Tone {
  switch (phase.trim().toLowerCase()) {
    case "responding":
    case "streaming":
    case "done":
      return "ok";
    case "attempt":
    case "waiting":
      return "warn";
    case "dropped":
      return "bad";
    case "routing":
      return "info";
    default:
      return "muted";
  }
}

export function statusTone(status: number): Tone {
  if (status >= 400) return "bad";
  if (status >= 300) return "warn";
  if (status > 0) return "ok";
  return "muted";
}
