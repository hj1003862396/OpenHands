import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentServerUIRoot } from "#/components/providers/agent-server-ui-root";
import {
  APPEARANCE_STORAGE_KEY,
  applyAppearance,
  readPersistedAppearance,
  setAppearance,
  toggleAppearance,
} from "#/themes/appearance";

const COLOR_THEME_STORAGE_KEY = "openhands-color-theme";

function cleanupAppearance() {
  window.localStorage.removeItem(APPEARANCE_STORAGE_KEY);
  window.localStorage.removeItem(COLOR_THEME_STORAGE_KEY);
  setAppearance("dark");
  document.getElementById("oh-appearance-override")?.remove();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  document.body.removeAttribute("data-theme");
  document.body.style.colorScheme = "";
}

describe("appearance mode", () => {
  afterEach(() => {
    cleanupAppearance();
  });

  it("stores dark or light separately from the color theme key", () => {
    window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, "openhands-neo");
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "openhands-neutral");

    expect(readPersistedAppearance()).toBe("light");

    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "light");

    expect(readPersistedAppearance()).toBe("light");
    expect(window.localStorage.getItem(COLOR_THEME_STORAGE_KEY)).toBe(
      "openhands-neo",
    );
  });

  it("applies data-theme and color-scheme on the document and UI root", () => {
    const root = document.createElement("div");
    root.setAttribute("data-agent-server-ui", "");
    document.body.appendChild(root);

    applyAppearance("light");

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(document.body).toHaveAttribute("data-theme", "light");
    expect(document.body.style.colorScheme).toBe("light");
    expect(root).toHaveAttribute("data-theme", "light");
    expect(root.style.colorScheme).toBe("light");

    const styleEl = document.getElementById("oh-appearance-override");
    expect(styleEl?.textContent).toContain("color-scheme: light");
    expect(styleEl?.textContent).toContain(
      "--oh-background: var(--cool-grey-50);",
    );
    expect(styleEl?.textContent).toContain(
      '[data-theme="light"][data-theme="light"]',
    );

    root.remove();
  });

  it("toggles the persisted mode without touching the color theme", () => {
    window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, "openhands-deepsea");
    setAppearance("dark");

    expect(toggleAppearance()).toBe("light");
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("light");
    expect(window.localStorage.getItem(COLOR_THEME_STORAGE_KEY)).toBe(
      "openhands-deepsea",
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("inlines light shell tokens and color-scheme on AgentServerUIRoot", () => {
    render(
      <AgentServerUIRoot theme="light">
        <div data-testid="appearance-child" />
      </AgentServerUIRoot>,
    );

    const scopeRoot = document.querySelector(
      "[data-agent-server-ui]",
    ) as HTMLElement;

    expect(scopeRoot).toHaveAttribute("data-theme", "light");
    expect(scopeRoot.style.colorScheme).toBe("light");
    expect(scopeRoot.style.getPropertyValue("--oh-foreground")).toBe(
      "var(--cool-grey-950)",
    );
    expect(scopeRoot.style.getPropertyValue("--oh-surface")).toBe("#ffffff");
    expect(scopeRoot.firstElementChild).toHaveAttribute("data-theme", "light");
  });
});
