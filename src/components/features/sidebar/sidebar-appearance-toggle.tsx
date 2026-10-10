import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useAppearance } from "#/hooks/use-appearance";
import { toggleAppearance } from "#/themes/appearance";
import { cn } from "#/utils/utils";
import { SIDEBAR_ICON_BUTTON_CLASS } from "./sidebar-layout";

interface SidebarAppearanceToggleProps {
  collapsed: boolean;
}

export function SidebarAppearanceToggle({
  collapsed,
}: SidebarAppearanceToggleProps) {
  const { t } = useTranslation("openhands");
  const appearance = useAppearance();
  const isLight = appearance === "light";
  const label = t(
    isLight ? I18nKey.SIDEBAR$SWITCH_TO_DARK : I18nKey.SIDEBAR$SWITCH_TO_LIGHT,
  );

  return (
    <div
      className={cn(
        "mt-auto flex w-full shrink-0 pb-1",
        collapsed ? "justify-center px-0" : "justify-start px-2.5",
      )}
    >
      <button
        type="button"
        data-testid="sidebar-appearance-toggle"
        aria-pressed={isLight}
        aria-label={label}
        onClick={() => {
          toggleAppearance();
        }}
        className={cn(
          SIDEBAR_ICON_BUTTON_CLASS,
          "text-[var(--oh-muted)] hover:bg-[var(--oh-hover-wash)] hover:text-[var(--oh-foreground)]",
        )}
      >
        {isLight ? (
          <Moon width={16} height={16} aria-hidden />
        ) : (
          <Sun width={16} height={16} aria-hidden />
        )}
      </button>
    </div>
  );
}
