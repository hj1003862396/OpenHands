import React from "react";
import { cn } from "#/utils/utils";
import {
  AGENT_SERVER_UI_DEFAULT_CSS_VARIABLES,
  AGENT_SERVER_UI_DEFAULT_THEME,
  type AgentServerUIStyleOverrides,
  type AgentServerUITheme,
} from "#/styles/agent-server-ui-style-scope";
import { LIGHT_APPEARANCE_CSS_VARIABLES } from "#/themes/appearance";

export interface AgentServerUIRootProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "style"
> {
  children: React.ReactNode;
  theme?: AgentServerUITheme;
  style?: React.CSSProperties;
  styleOverrides?: AgentServerUIStyleOverrides;
  contentClassName?: string;
}

export function AgentServerUIRoot({
  children,
  theme = AGENT_SERVER_UI_DEFAULT_THEME,
  className,
  style,
  styleOverrides,
  contentClassName,
  ...divProps
}: AgentServerUIRootProps) {
  const scopedStyle = React.useMemo(() => {
    const appearanceTokens =
      theme === "light" ? LIGHT_APPEARANCE_CSS_VARIABLES : null;
    return {
      ...AGENT_SERVER_UI_DEFAULT_CSS_VARIABLES,
      ...appearanceTokens,
      ...styleOverrides,
      ...style,
      ...(theme === "dark" || theme === "light" ? { colorScheme: theme } : {}),
    } as React.CSSProperties;
  }, [style, styleOverrides, theme]);

  return (
    <div
      data-agent-server-ui=""
      {...divProps}
      data-theme={theme === "default" ? undefined : theme}
      className={className}
      // CSS custom properties injected onto the scope root so descendants can resolve var(--oh-*)
      style={scopedStyle}
    >
      <div
        className={cn(theme, contentClassName, "text-foreground")}
        data-theme={theme}
      >
        {children}
      </div>
    </div>
  );
}
