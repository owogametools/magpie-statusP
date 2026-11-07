// Small transient messages above the footer.

export type ToastKind = "info" | "success" | "error";

export interface Toaster {
  show(message: string, kind?: ToastKind): void;
}

const MAX_VISIBLE = 3;

export function createToaster(host: HTMLElement): Toaster {
  return {
    show(message: string, kind: ToastKind = "info"): void {
      const text = message.trim();
      if (!text) return;

      const toast = document.createElement("div");
      toast.className = `toast ${kind}`;
      toast.textContent = text;
      host.append(toast);

      while (host.children.length > MAX_VISIBLE) {
        host.firstElementChild?.remove();
      }

      const life = kind === "error" ? 4200 : 2800;
      window.setTimeout(() => {
        toast.classList.add("leaving");
        window.setTimeout(() => toast.remove(), 180);
      }, life);
    },
  };
}
