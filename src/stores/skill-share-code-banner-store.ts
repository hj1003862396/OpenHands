import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface SkillShareCodeBannerState {
  /**
   * Creator-init observation event ids the user dismissed. Session-only:
   * a reload may resurface the code banner for the same event, which is fine.
   */
  dismissedEventIds: Record<string, true>;
}

interface SkillShareCodeBannerActions {
  dismiss: (eventIds: string[]) => void;
}

type SkillShareCodeBannerStore = SkillShareCodeBannerState &
  SkillShareCodeBannerActions;

const initialState: SkillShareCodeBannerState = { dismissedEventIds: {} };

export const useSkillShareCodeBannerStore = create<SkillShareCodeBannerStore>()(
  devtools(
    (set) => ({
      ...initialState,
      dismiss: (eventIds) =>
        set((s) => ({
          dismissedEventIds: {
            ...s.dismissedEventIds,
            ...Object.fromEntries(eventIds.map((id) => [id, true as const])),
          },
        })),
    }),
    { name: "SkillShareCodeBannerStore" },
  ),
);
