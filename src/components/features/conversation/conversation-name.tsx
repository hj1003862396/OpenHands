import React from "react";
import { useTranslation } from "react-i18next";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useUpdateConversation } from "#/hooks/mutation/use-update-conversation";
import { useConversationId } from "#/hooks/use-conversation-id";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";
import { EllipsisButton } from "../conversation-panel/ellipsis-button";
import { ConversationNameContextMenu } from "./conversation-name-context-menu";

export function ConversationName() {
  const { t } = useTranslation("openhands");
  const { conversationId } = useConversationId();
  const { data: conversation } = useActiveConversation();
  const { mutate: updateConversation } = useUpdateConversation();

  const [titleMode, setTitleMode] = React.useState<"view" | "edit">("view");
  const [contextMenuOpen, setContextMenuOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const ellipsisAnchorRef = React.useRef<HTMLDivElement>(null);

  const handleDoubleClick = () => {
    setTitleMode("edit");
  };

  const handleBlur = () => {
    if (inputRef.current?.value && conversationId) {
      const trimmed = inputRef.current.value.trim();
      if (trimmed !== conversation?.title) {
        updateConversation(
          { conversationId, newTitle: trimmed },
          {
            onSuccess: () => {
              displaySuccessToast(t(I18nKey.CONVERSATION$TITLE_UPDATED));
            },
          },
        );
      }
    } else if (inputRef.current) {
      // reset the value if it's empty
      inputRef.current.value = conversation?.title ?? "";
    }

    setTitleMode("view");
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Ignore Enter key during IME composition (e.g., Chinese, Japanese, Korean input)
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  };

  const handleInputClick = (event: React.MouseEvent<HTMLInputElement>) => {
    if (titleMode === "edit") {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleEllipsisClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenuOpen(!contextMenuOpen);
  };

  const handleRename = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setTitleMode("edit");
    setContextMenuOpen(false);
  };

  React.useEffect(() => {
    if (titleMode === "edit") {
      inputRef.current?.focus();
    }
  }, [titleMode]);

  if (!conversation) {
    return null;
  }

  return (
    <>
      <div
        className="flex items-center gap-2 h-[22px] text-base font-normal text-left pl-0 lg:pl-1 min-w-0"
        data-testid="conversation-name"
      >
        {titleMode === "edit" ? (
          <input
            ref={inputRef}
            data-testid="conversation-name-input"
            onClick={handleInputClick}
            onBlur={handleBlur}
            onKeyUp={handleKeyUp}
            type="text"
            defaultValue={conversation.title || ""}
            className="text-[var(--oh-foreground)] leading-5 bg-transparent border-none outline-none text-base font-normal w-fit max-w-fit field-sizing-content"
          />
        ) : (
          <div
            className="text-[var(--oh-foreground)] leading-5 truncate"
            data-testid="conversation-name-title"
            onDoubleClick={handleDoubleClick}
            title={conversation.title || ""}
          >
            {conversation.title}
          </div>
        )}

        {titleMode !== "edit" && (
          <div
            ref={ellipsisAnchorRef}
            className="relative flex items-center shrink-0"
          >
            <EllipsisButton
              onClick={handleEllipsisClick}
              ariaLabel={t(I18nKey.COMMON$MORE_OPTIONS)}
            />
            {contextMenuOpen && (
              <ConversationNameContextMenu
                onClose={() => setContextMenuOpen(false)}
                onRename={handleRename}
                position="bottom"
                anchorRef={ellipsisAnchorRef}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
