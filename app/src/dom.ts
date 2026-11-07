// Tiny DOM helpers. Data always goes through textContent or setAttribute;
// innerHTML is reserved for trusted, static SVG markup in icons.ts.

export type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  title?: string;
  value?: string | number;
  placeholder?: string;
  type?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  checked?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: {
    [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void;
  };
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title !== undefined) el.title = props.title;
  if (props.hidden !== undefined) el.hidden = props.hidden;

  if (props.attrs) {
    for (const [name, value] of Object.entries(props.attrs)) {
      if (value === null || value === undefined || value === false) continue;
      el.setAttribute(name, value === true ? "" : String(value));
    }
  }

  if (props.value !== undefined) {
    (el as unknown as { value: string }).value = String(props.value);
  }
  if (props.placeholder !== undefined) {
    (el as unknown as { placeholder: string }).placeholder = props.placeholder;
  }
  if (props.type !== undefined) {
    (el as unknown as { type: string }).type = props.type;
  }
  if (props.min !== undefined) el.setAttribute("min", String(props.min));
  if (props.max !== undefined) el.setAttribute("max", String(props.max));
  if (props.step !== undefined) el.setAttribute("step", String(props.step));
  if (props.checked !== undefined) {
    (el as unknown as { checked: boolean }).checked = props.checked;
  }
  if (props.disabled !== undefined) {
    (el as unknown as { disabled: boolean }).disabled = props.disabled;
  }

  if (props.on) {
    for (const [name, handler] of Object.entries(props.on)) {
      if (handler) el.addEventListener(name, handler as EventListener);
    }
  }

  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(
      typeof child === "string" ? document.createTextNode(child) : child,
    );
  }
}

export function clear(el: Node): void {
  el.textContent = "";
}

/** Sets text only when it changed, so frequent state events do not churn DOM. */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden;
}

export function setDisabled(
  el: HTMLButtonElement | HTMLInputElement | HTMLSelectElement,
  disabled: boolean,
): void {
  if (el.disabled !== disabled) el.disabled = disabled;
}

export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}
