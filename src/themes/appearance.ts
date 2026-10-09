export type AppearanceMode = "dark" | "light";

/** Separate from color-theme palettes (deep sea / neutral / neo). */
export const APPEARANCE_STORAGE_KEY = "openhands-appearance";

export const DEFAULT_APPEARANCE_MODE: AppearanceMode = "dark";

const APPEARANCE_STYLE_TAG_ID = "oh-appearance-override";

/**
 * Light-mode overrides for shell, sidebar, home, and chat surfaces.
 * Dark mode keeps the values in `AGENT_SERVER_UI_DEFAULT_CSS_VARIABLES` /
 * `tailwind.css`. These point at the active cool-grey scale so a color theme
 * still tints the light shell.
 */
export const LIGHT_APPEARANCE_CSS_VARIABLES: Record<string, string> = {
  "--oh-color-base": "var(--cool-grey-50)",
  "--oh-color-base-secondary": "#ffffff",
  "--oh-color-basic": "var(--cool-grey-600)",
  "--oh-color-tertiary": "var(--cool-grey-200)",
  "--oh-color-tertiary-light": "var(--cool-grey-700)",
  "--oh-color-content": "var(--cool-grey-950)",
  "--oh-color-content-2": "var(--cool-grey-900)",
  "--oh-background": "var(--cool-grey-50)",
  "--oh-foreground": "var(--cool-grey-950)",
  "--oh-surface": "#ffffff",
  "--oh-surface-foreground": "var(--cool-grey-950)",
  "--oh-surface-raised": "var(--cool-grey-100)",
  "--oh-surface-deep": "var(--cool-grey-200)",
  "--oh-overlay": "#ffffff",
  "--oh-overlay-foreground": "var(--cool-grey-950)",
  "--oh-modal-title-foreground": "var(--cool-grey-950)",
  "--oh-muted": "var(--cool-grey-600)",
  "--oh-text-secondary": "var(--cool-grey-700)",
  "--oh-text-tertiary": "var(--cool-grey-800)",
  "--oh-text-dim": "var(--cool-grey-500)",
  "--oh-text-subtle": "var(--cool-grey-500)",
  "--oh-interactive-hover": "var(--cool-grey-200)",
  "--oh-interactive-hover-low": "var(--cool-grey-100)",
  "--oh-interactive-active": "var(--cool-grey-300)",
  "--oh-interactive-selected": "var(--cool-grey-300)",
  "--oh-scrollbar": "color-mix(in srgb, var(--cool-grey-600) 35%, transparent)",
  "--oh-scrollbar-hover":
    "color-mix(in srgb, var(--cool-grey-600) 55%, transparent)",
  "--oh-default": "var(--cool-grey-100)",
  "--oh-default-foreground": "var(--cool-grey-950)",
  "--oh-segment": "#ffffff",
  "--oh-segment-foreground": "var(--cool-grey-950)",
  "--oh-border": "var(--cool-grey-300)",
  "--oh-border-input": "var(--cool-grey-400)",
  "--oh-border-subtle": "var(--cool-grey-200)",
  "--oh-border-hairline":
    "color-mix(in srgb, var(--cool-grey-950) 12%, transparent)",
  "--oh-hover-wash": "color-mix(in srgb, var(--cool-grey-950) 8%, transparent)",
  "--oh-edge-highlight": "color-mix(in srgb, black 8%, transparent)",
  "--oh-separator": "rgba(11, 14, 20, 0.12)",
  "--oh-focus": "var(--cool-grey-950)",
  "--oh-link": "var(--cool-grey-800)",
  "--oh-bg-dark": "var(--cool-grey-100)",
  "--oh-bg-light": "#ffffff",
  "--oh-bg-input": "#ffffff",
  "--oh-bg-workspace": "var(--cool-grey-50)",
  "--oh-text-editor-base": "var(--cool-grey-600)",
  "--oh-text-editor-active": "var(--cool-grey-800)",
  "--oh-bg-editor-sidebar": "var(--cool-grey-100)",
  "--oh-bg-editor-active": "#ffffff",
  "--oh-border-editor-sidebar": "var(--cool-grey-300)",
  "--oh-bg-neutral-muted":
    "color-mix(in srgb, var(--cool-grey-700) 12%, transparent)",
};

/** HeroUI channel overrides so light `data-theme` is not stuck on the dark palette. */
const LIGHT_HEROUI: Record<string, string> = {
  "--heroui-background": "216 45% 98%",
  "--heroui-background-foreground": "220 29% 6%",
  "--heroui-foreground": "222 18% 16%",
  "--heroui-foreground-50": "216 45% 98%",
  "--heroui-foreground-100": "216 34% 95%",
  "--heroui-foreground-200": "216 27% 90%",
  "--heroui-foreground-300": "216 22% 81%",
  "--heroui-foreground-400": "216 16% 70%",
  "--heroui-foreground-500": "219 14% 45%",
  "--heroui-foreground-600": "221 16% 35%",
  "--heroui-foreground-700": "222 18% 27%",
  "--heroui-foreground-800": "224 18% 21%",
  "--heroui-foreground-900": "223 18% 16%",
  "--heroui-content1": "0 0% 100%",
  "--heroui-content1-foreground": "220 29% 6%",
  "--heroui-content2": "216 34% 95%",
  "--heroui-content2-foreground": "222 18% 16%",
  "--heroui-content3": "216 27% 90%",
  "--heroui-content3-foreground": "222 18% 16%",
  "--heroui-content4": "216 16% 70%",
  "--heroui-content4-foreground": "220 29% 6%",
  "--heroui-default-50": "0 0% 100%",
  "--heroui-default-100": "216 45% 98%",
  "--heroui-default-200": "216 34% 95%",
  "--heroui-default-300": "216 27% 90%",
  "--heroui-default-400": "216 22% 81%",
  "--heroui-default-500": "216 16% 70%",
  "--heroui-default-600": "219 14% 45%",
  "--heroui-default-700": "221 16% 35%",
  "--heroui-default-800": "222 18% 27%",
  "--heroui-default-900": "224 18% 21%",
  "--heroui-default-foreground": "220 29% 6%",
  "--heroui-default": "216 27% 90%",
  "--heroui-focus": "220 29% 6%",
};

const listeners = new Set<() => void>();
let currentMode: AppearanceMode | undefined;

export function isAppearanceMode(
  value: string | null,
): value is AppearanceMode {
  return value === "dark" || value === "light";
}

export function readPersistedAppearance(): AppearanceMode {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE_MODE;
  try {
    const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (isAppearanceMode(stored)) return stored;
  } catch {
    // ignore quota / privacy-mode failures
  }
  return DEFAULT_APPEARANCE_MODE;
}

export function persistAppearance(mode: AppearanceMode): void {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export function getAppearanceSnapshot(): AppearanceMode {
  if (currentMode === undefined) {
    currentMode = readPersistedAppearance();
  }
  return currentMode;
}

export function getAppearanceServerSnapshot(): AppearanceMode {
  return DEFAULT_APPEARANCE_MODE;
}

export function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitAppearance(): void {
  for (const listener of listeners) {
    listener();
  }
}

function cssDeclarations(record: Record<string, string>): string {
  return Object.entries(record)
    .map(([property, value]) => `  ${property}: ${value};`)
    .join("\n");
}

function buildAppearanceCss(mode: AppearanceMode): string {
  if (mode === "dark") {
    return [
      `html[data-theme="dark"] { color-scheme: dark; }`,
      `[data-agent-server-ui][data-theme="dark"][data-agent-server-ui][data-theme="dark"] { color-scheme: dark; }`,
    ].join("\n");
  }

  const surface = cssDeclarations(LIGHT_APPEARANCE_CSS_VARIABLES);
  const heroui = cssDeclarations(LIGHT_HEROUI);
  return [
    `html[data-theme="light"] { color-scheme: light; }`,
    `[data-agent-server-ui][data-theme="light"][data-agent-server-ui][data-theme="light"] {\n  color-scheme: light;\n${surface}\n${heroui}\n}`,
    `[data-theme="light"][data-theme="light"] {\n${heroui}\n}`,
  ].join("\n");
}

/**
 * Apply appearance to the document element and every agent-server UI root.
 * Color-theme palettes stay on their own storage key; this only flips
 * `data-theme` and `color-scheme`.
 */
export function applyAppearance(mode: AppearanceMode): void {
  if (typeof document === "undefined") return;

  const targets: HTMLElement[] = [document.documentElement];
  if (document.body) {
    targets.push(document.body);
  }
  document.querySelectorAll("[data-agent-server-ui]").forEach((node) => {
    if (node instanceof HTMLElement && !targets.includes(node)) {
      targets.push(node);
    }
  });

  for (const element of targets) {
    element.setAttribute("data-theme", mode);
    element.style.colorScheme = mode;
  }

  let styleEl = document.getElementById(
    APPEARANCE_STYLE_TAG_ID,
  ) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = APPEARANCE_STYLE_TAG_ID;
  }
  styleEl.textContent = buildAppearanceCss(mode);
  document.head.appendChild(styleEl);
}

export function setAppearance(mode: AppearanceMode): void {
  currentMode = mode;
  persistAppearance(mode);
  applyAppearance(mode);
  emitAppearance();
}

export function toggleAppearance(): AppearanceMode {
  const next: AppearanceMode =
    getAppearanceSnapshot() === "light" ? "dark" : "light";
  setAppearance(next);
  return next;
}
