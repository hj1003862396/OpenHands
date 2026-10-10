import {
  oneLight,
  vscDarkPlus,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import type { AppearanceMode } from "#/themes/appearance";

/** Prism theme that matches the current light/dark appearance. */
export function syntaxHighlighterStyleForAppearance(mode: AppearanceMode) {
  return mode === "light" ? oneLight : vscDarkPlus;
}
