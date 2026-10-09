import React from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Server,
  PanelsTopLeft,
} from "lucide-react";
import { OpenHandsLogoButton } from "#/components/shared/buttons/openhands-logo-button";
import { SidebarCollapsedIconSlot } from "./sidebar-collapsed-icon-slot";
import { SidebarNavLink } from "./sidebar-nav-link";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { BackendSelector } from "#/components/features/backends/backend-selector";
import { BackendStatusDot } from "#/components/features/backends/backend-status-dot";
import { SidebarConversationList } from "./sidebar-conversation-list";
import {
  SIDEBAR_COLLAPSE_TOGGLE_OVERLAY_CLASS,
  SIDEBAR_COLLAPSED_LOGO_WRAPPER_CLASS,
  SIDEBAR_ICON_BUTTON_CLASS,
  SIDEBAR_ICON_SLOT_CLASS,
  sidebarHeaderRowClassName,
  sidebarNavLabelClassName,
  sidebarNavListClassName,
  sidebarNavRowClassName,
} from "./sidebar-layout";
import { useCanvasExtensionsRuntime } from "#/components/features/canvas-extensions/canvas-extensions-runtime";
import type { Backend } from "#/api/backend-registry/types";

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
  activeBackend: Backend;
  activeBackendHealth: { isConnected: boolean | null } | undefined;
  collapsedBackendPopoverOpen: boolean;
  setCollapsedBackendPopoverOpen: (open: boolean) => void;
  collapsedBackendPopoverRef: React.RefObject<HTMLDivElement | null>;
  collapsedBackendCloseTimer: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
  onOpenAddBackend: () => void;
  onOpenManageBackends: () => void;
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
  activeBackend: _activeBackend,
  activeBackendHealth,
  collapsedBackendPopoverOpen,
  setCollapsedBackendPopoverOpen,
  collapsedBackendPopoverRef,
  collapsedBackendCloseTimer,
  onOpenAddBackend,
  onOpenManageBackends,
}: SidebarRailBodyProps) {
  const { t } = useTranslation("openhands");
  const { pages: canvasExtensionPages } = useCanvasExtensionsRuntime();
  const backendCloseTimerRef = collapsedBackendCloseTimer;

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
              className={cn(SIDEBAR_ICON_SLOT_CLASS, "overflow-visible")}
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

      {collapsed && showCollapseToggle ? (
        <nav
          className={cn(
            sidebarNavListClassName(collapsed),
            "mt-auto pb-2 cursor-pointer",
          )}
        >
          <div
            className="relative"
            ref={collapsedBackendPopoverRef}
            onMouseEnter={() => {
              if (backendCloseTimerRef.current) {
                clearTimeout(backendCloseTimerRef.current);
                backendCloseTimerRef.current = null;
              }
              setCollapsedBackendPopoverOpen(true);
            }}
            onMouseLeave={() => {
              backendCloseTimerRef.current = setTimeout(
                () => setCollapsedBackendPopoverOpen(false),
                150,
              );
            }}
          >
            <button
              type="button"
              data-testid="collapsed-backend-selector-link"
              aria-label={t(I18nKey.BACKEND$MANAGE)}
              aria-expanded={collapsedBackendPopoverOpen}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onMouseUp={(event) => event.stopPropagation()}
              className={cn(
                sidebarNavRowClassName({ collapsed: true }),
                "relative",
              )}
            >
              <SidebarCollapsedIconSlot active={collapsedBackendPopoverOpen}>
                <span className="relative inline-flex size-[18px] shrink-0 items-center justify-center">
                  <BackendStatusDot
                    isConnected={activeBackendHealth?.isConnected ?? null}
                    className="absolute -left-0.5 -top-0.5 z-[1] pointer-events-none"
                  />
                  <Server width={ICON_SIZE} height={ICON_SIZE} />
                </span>
              </SidebarCollapsedIconSlot>
              <span className={sidebarNavLabelClassName(true)}>
                {t(I18nKey.BACKEND$MANAGE)}
              </span>
            </button>
            {collapsedBackendPopoverOpen ? (
              <div
                className="absolute bottom-[-4px] left-full pl-2.5 z-40 w-[272px]"
                onClick={(event) => event.stopPropagation()}
              >
                <BackendSelector
                  sidebarCollapsed={collapsed}
                  hideTrigger
                  defaultOpen
                  openUpward
                  onSelectOption={() => setCollapsedBackendPopoverOpen(false)}
                  onOpenAddBackend={onOpenAddBackend}
                  onOpenManageBackends={onOpenManageBackends}
                />
              </div>
            ) : null}
          </div>
        </nav>
      ) : null}

      {!collapsed ? (
        <>
          <div
            className={cn(
              "flex flex-col items-stretch max-w-none box-border shrink-0 gap-2",
              "-ml-2.5 w-[calc(100%+0.625rem)] border-t border-[var(--oh-border)] pt-2 px-2.5",
            )}
          >
            <BackendSelector sidebarCollapsed={collapsed} openUpward />
          </div>
        </>
      ) : null}
    </div>
  );
}
