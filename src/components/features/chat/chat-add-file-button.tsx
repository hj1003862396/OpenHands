import React from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { chatInputIconButtonClassName } from "#/utils/form-control-classes";

export interface ChatAddFileButtonProps {
  handleFileIconClick: () => void;
  disabled?: boolean;
  /**
   * Kept for call-site compatibility. Agent-profile switching used to live in
   * the plus menu; that menu now only adds files/images, so this is ignored.
   */
  showAgentProfileSwitch?: boolean;
}

export function ChatAddFileButton({
  handleFileIconClick,
  disabled = false,
}: ChatAddFileButtonProps) {
  const { t } = useTranslation("openhands");

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    handleFileIconClick();
  };

  return (
    <button
      type="button"
      className={cn(
        chatInputIconButtonClassName,
        "relative shrink-0 size-6",
        disabled
          ? "cursor-not-allowed text-[var(--oh-text-subtle)]"
          : undefined,
      )}
      aria-label={t(I18nKey.CHAT_INTERFACE$ADD_FILES_AND_IMAGES)}
      data-testid="chat-plus-button"
      onClick={handleClick}
      disabled={disabled}
    >
      <span className="flex h-full w-full items-center justify-center">
        <Plus className="h-[13px] w-[13px] shrink-0" strokeWidth={2} />
      </span>
    </button>
  );
}
