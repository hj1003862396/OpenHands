import React from "react";
import { useTranslation } from "react-i18next";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useUpdateConversation } from "#/hooks/mutation/use-update-conversation";
import { useConversationId } from "#/hooks/use-conversation-id";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";

export function ConversationName() {
  const { t } = useTranslation("openhands");
  const { conversationId } = useConversationId();
  const { data: conversation } = useActiveConversation();
  const { mutate: updateConversation } = useUpdateConversation();

  const [titleMode, setTitleMode] = React.useState<"view" | "edit">("view");
  const inputRef = React.useRef<HTMLInputElement>(null);

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
      </div>
    </>
  );
}
