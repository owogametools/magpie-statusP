// Static inline SVG. Data never reaches innerHTML; only these literals do.

const stroke = `fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;

export const LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M21.4 2.3c-.3 3.2-1.5 6-3.5 8.4-2.4 2.9-5.9 4.7-10.1 5l-3.5.2 2.5-2.1c1.5-1.2 2.9-2.8 4.2-4.6L9.2 11c2.2-1 4-2.7 5.4-4.9-2 1.5-4.2 2.5-6.7 3 .8-2.3 2.4-4.2 4.8-5.5 2.6-1.4 5.4-1.8 8.7-1.3Z"/>
  <path d="M3.9 21c4-.1 7.4-1.6 10.1-4.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
</svg>`;

const ICONS = {
  refresh: `<svg viewBox="0 0 24 24" ${stroke}><path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4v7h-7"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.22.42.6.73 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/></svg>`,
  hide: `<svg viewBox="0 0 24 24" ${stroke}><path d="m6 9 6 6 6-6"/><path d="M6 21h12"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" ${stroke}><path d="m9 6 6 6-6 6"/></svg>`,
  arrowUp: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 19V5"/><path d="m6 11 6-6 6 6"/></svg>`,
  arrowDown: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 5v14"/><path d="m18 13-6 6-6-6"/></svg>`,
  window: `<svg viewBox="0 0 24 24" ${stroke}><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18"/><path d="M7 6.5h.01M10 6.5h.01"/></svg>`,
  panel: `<svg viewBox="0 0 24 24" ${stroke}><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" ${stroke}><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-10Z"/></svg>`,
  image: `<svg viewBox="0 0 24 24" ${stroke}><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 15-4.5-4.5L8 20"/></svg>`,
  external: `<svg viewBox="0 0 24 24" ${stroke}><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M20 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H10"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" ${stroke}><path d="M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.6L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 16.5h.01"/></svg>`,
  power: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 3v9"/><path d="M6.4 6.4a8 8 0 1 0 11.2 0"/></svg>`,
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "icon";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = ICONS[name];
  return span;
}

const PLACEHOLDERS: Record<string, string> = {
  idle: `<svg viewBox="0 0 120 120" ${stroke} stroke-width="3" aria-hidden="true">
    <circle cx="58" cy="64" r="32"/>
    <path d="M45 64c2.5 2.5 5.5 2.5 8 0M63 64c2.5 2.5 5.5 2.5 8 0"/>
    <path d="M51 78c4.5 3.5 10.5 3.5 15 0"/>
    <path d="M86 24h8l-8 10h8M101 12h7l-7 9h7"/>
  </svg>`,
  routing: `<svg viewBox="0 0 120 120" ${stroke} stroke-width="3" aria-hidden="true">
    <circle cx="60" cy="60" r="9"/>
    <path d="M52 53 35 36M52 60H24M52 67 35 84"/>
    <path d="M40 36h-8v8M31 58h-9M40 84h-8v-8"/>
  </svg>`,
  waiting: `<svg viewBox="0 0 120 120" ${stroke} stroke-width="3" aria-hidden="true">
    <path d="M38 20h44M38 100h44"/>
    <path d="M44 20c0 18 16 22 16 40s-16 22-16 40M76 20c0 18-16 22-16 40s16 22 16 40"/>
  </svg>`,
  streaming: `<svg viewBox="0 0 120 120" ${stroke} stroke-width="3.2" aria-hidden="true">
    <path d="M24 60h10M42 44v32M54 32v56M66 40v40M78 52v16M90 58h6"/>
  </svg>`,
  fallback: `<svg viewBox="0 0 120 120" ${stroke} stroke-width="3" aria-hidden="true">
    <path d="M32 50a28 28 0 0 1 48-16"/>
    <path d="M80 24v14H66"/>
    <path d="M88 70a28 28 0 0 1-48 16"/>
    <path d="M40 96V82h14"/>
  </svg>`,
  failed: `<svg viewBox="0 0 120 120" ${stroke} stroke-width="3" aria-hidden="true">
    <circle cx="60" cy="60" r="32"/>
    <path d="m48 48 24 24M72 48 48 72"/>
  </svg>`,
  offline: `<svg viewBox="0 0 120 120" ${stroke} stroke-width="3" aria-hidden="true">
    <path d="M60 24v30"/>
    <path d="M38 38a32 32 0 1 0 44 0"/>
  </svg>`,
};

/** inert state-specific artwork for the avatar stage and thumbnails */
export function placeholderSvg(state: string): string {
  return PLACEHOLDERS[state.trim().toLowerCase()] ?? PLACEHOLDERS.idle!;
}
