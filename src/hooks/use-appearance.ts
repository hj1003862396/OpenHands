import { useSyncExternalStore } from "react";
import {
  getAppearanceServerSnapshot,
  getAppearanceSnapshot,
  subscribeAppearance,
  type AppearanceMode,
} from "#/themes/appearance";

export function useAppearance(): AppearanceMode {
  return useSyncExternalStore(
    subscribeAppearance,
    getAppearanceSnapshot,
    getAppearanceServerSnapshot,
  );
}
