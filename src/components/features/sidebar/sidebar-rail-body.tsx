import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Plus, PanelsTopLeft } from "lucide-react";
import { OpenHandsLogoButton } from "#/components/shared/buttons/openhands-logo-button";
import { SidebarNavLink } from "./sidebar-nav-link";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { SidebarConversationList } from "./sidebar-conversation-list";
import {
  SIDEBAR_COLLAPSE_TOGGLE_OVERLAY_CLASS,
  SIDEBAR_COLLAPSED_LOGO_WRAPPER_CLASS,
  SIDEBAR_ICON_BUTTON_CLASS,
  SIDEBAR_ICON_SLOT_CLASS,
  sidebarHeaderRowClassName,
  sidebarNavListClassName,
} from "./sidebar-layout";
import { useCanvasExtensionsRuntime } from "#/components/features/canvas-extensions/canvas-extensions-runtime";
const ICON_SIZE = 18;
const SIDEBAR_LOGO_WIDTH = 28;
const SIDEBAR_LOGO_HEIGHT = 28;

export interface SidebarRailBodyProps {
  collapsed: boolean;
  showCollapseToggle: boolean;
  showMobileCloseButton?: boolean;
  onCloseMobile?: () => void;
  collapseToggleLabel: string;
  onCollapse: () => void;
  onExpand: () => void;
  showCollapsedExpandButton: boolean;
  isExtensionsActive: boolean;
  currentPath: string;
}

export function SidebarRailBody({
  collapsed,
  showCollapseToggle,
  showMobileCloseButton = false,
  onCloseMobile,
  collapseToggleLabel,
  onCollapse,
  onExpand,
  showCollapsedExpandButton,
  isExtensionsActive: _isExtensionsActive,
  currentPath: _currentPath,
}: SidebarRailBodyProps) {
  const { t } = useTranslation("openhands");
  const { pages: canvasExtensionPages } = useCanvasExtensionsRuntime();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sidebarHeaderRowClassName(collapsed)}>
        <div
          className={cn(
            collapsed && showCollapseToggle
              ? SIDEBAR_COLLAPSED_LOGO_WRAPPER_CLASS
              : "flex min-w-0 shrink-0 items-center",
          )}
        >
          <div
            className={cn(
              collapsed &&
                showCollapseToggle &&
                "flex h-full w-full items-center justify-start pl-2.5 transition-opacity duration-150",
              collapsed && showCollapsedExpandButton && "opacity-0",
            )}
          >
            <OpenHandsLogoButton
              logoWidth={SIDEBAR_LOGO_WIDTH}
              logoHeight={SIDEBAR_LOGO_HEIGHT}
              logoClassName="max-w-none"
              showWordmark={!collapsed}
              className={cn(
                collapsed
                  ? SIDEBAR_ICON_SLOT_CLASS
                  : "h-9 min-w-0 overflow-visible",
              )}
            />
          </div>
          {collapsed && showCollapseToggle ? (
            <button
              type="button"
              data-testid="sidebar-collapse-toggle"
              aria-pressed={collapsed}
              aria-label={collapseToggleLabel}
              onClick={onExpand}
              className={cn(
                SIDEBAR_COLLAPSE_TOGGLE_OVERLAY_CLASS,
                showCollapsedExpandButton
                  ? "opacity-100 pointer-events-auto"
                  : "opacity-0 pointer-events-none",
              )}
            >
              <ChevronRight width={14} height={14} />
            </button>
          ) : null}
        </div>
        {!collapsed && showCollapseToggle ? (
          <button
            type="button"
            data-testid="sidebar-collapse-toggle"
            aria-pressed={collapsed}
            aria-label={collapseToggleLabel}
            onClick={onCollapse}
            className={cn(
              "hidden md:inline-flex ml-auto",
              SIDEBAR_ICON_BUTTON_CLASS,
              "text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)]",
            )}
          >
            <ChevronLeft width={14} height={14} />
          </button>
        ) : null}
        {!collapsed && showMobileCloseButton ? (
          <button
            type="button"
            data-testid="sidebar-mobile-drawer-close"
            onClick={onCloseMobile}
            aria-label={t(I18nKey.SIDEBAR$CLOSE_MENU)}
            className={cn(
              "inline-flex ml-auto",
              SIDEBAR_ICON_BUTTON_CLASS,
              "text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)]",
            )}
          >
            <ChevronLeft width={14} height={14} />
          </button>
        ) : null}
      </div>

      <nav className={sidebarNavListClassName(collapsed)}>
        <SidebarNavLink
          to="/conversations"
          end
          label={t(I18nKey.SIDEBAR$NEW_CHAT)}
          testId="sidebar-conversations-link"
          collapsed={collapsed}
          icon={<Plus width={ICON_SIZE} height={ICON_SIZE} />}
        />
        {canvasExtensionPages.map((page) => (
          <SidebarNavLink
            key={`${page.extension.name}:${page.contribution.id}`}
            to={page.href}
            label={page.contribution.nav_label || page.contribution.title}
            testId={`sidebar-canvas-extension-${page.extension.name}-${page.contribution.id}`}
            collapsed={collapsed}
            icon={<PanelsTopLeft width={ICON_SIZE} height={ICON_SIZE} />}
          />
        ))}
      </nav>

      <SidebarConversationList collapsed={collapsed} />
    </div>
  );
}
