// Theme resolution: the config stores system/light/dark, the document gets
// the resolved dataset.theme and color-scheme. System mode listens to the
// desktop's appearance live.

export type ThemeMode = "system" | "light" | "dark";

const media = window.matchMedia("(prefers-color-scheme: dark)");
let mode: ThemeMode = "system";

function resolve(value: ThemeMode): "light" | "dark" {
  if (value === "light" || value === "dark") return value;
  return media.matches ? "dark" : "light";
}

export function applyTheme(value: string): void {
  mode = value === "light" || value === "dark" ? value : "system";
  const resolved = resolve(mode);
  const root = document.documentElement;
  if (root.dataset.theme !== resolved) root.dataset.theme = resolved;
  if (root.style.colorScheme !== resolved) root.style.colorScheme = resolved;
}

export function getThemeMode(): ThemeMode {
  return mode;
}

media.addEventListener("change", () => {
  if (mode === "system") applyTheme("system");
});

applyTheme("system");
