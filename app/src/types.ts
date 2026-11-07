import type { ConfigPatch, ConfigView, StateView } from "./mygo";
import type { ToastKind } from "./toast";

export type TabId = "usage" | "agents" | "actions" | "avatar" | "settings";

export const TAB_IDS: readonly TabId[] = [
  "usage",
  "agents",
  "actions",
  "avatar",
  "settings",
];

export function isTabId(value: string): value is TabId {
  return (TAB_IDS as readonly string[]).includes(value);
}

/** What the shell offers every tab. */
export interface AppContext {
  getState(): StateView | null;
  getBootError(): string;
  toast(message: string, kind?: ToastKind): void;
  errorToast(err: unknown): void;
  navigate(tab: TabId): void;
  applyState(state: StateView): void;
  applyConfig(config: ConfigView): void;
  /** May reject; callers decide what to show and where. */
  saveConfig(patch: ConfigPatch): Promise<ConfigView>;
  /** May reject; applies the returned snapshot on success. */
  refreshNow(): Promise<StateView>;
  /** Applies a language immediately; optimistic marks a pending save. */
  applyLanguage(language: string, optimistic?: boolean): void;
  /** Whether the avatar page currently hides the shell around it. */
  isImmersive(): boolean;
  /** Shows or hides the shell chrome for the portrait avatar view. */
  setImmersive(active: boolean): void;
}

export interface TabView {
  readonly el: HTMLElement;
  /** Paint the latest state. Called for the visible tab only. */
  update(): void;
  /** Rebuild labels after a language change, keeping local UI state. */
  rebuild(): void;
}
