/* eslint-disable i18next/no-literal-string -- skill-code UI: hardcoded zh-CN for now */
import { useState } from "react";
import toast from "react-hot-toast";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { useNavigation } from "#/context/navigation-context";
import {
  displayErrorToast,
  TOAST_OPTIONS,
} from "#/utils/custom-toast-handlers";
import {
  isValidSkillShareCode,
  lookupSkillShareCode,
  readSkillShareCodes,
  type SkillShareCodeEntry,
} from "#/utils/skill-share-codes";
import { cn } from "#/utils/utils";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { BaseModalTitle } from "#/components/shared/modals/confirmation-modals/base-modal";
import { BrandButton } from "#/components/features/settings/brand-button";

/** Opening message when redeeming a share code into a new chat. */
function skillRedeemLaunchQuery(skillName: string): string {
  return `/${skillName}\n\n请全程用简体中文与我交流。`;
}

function savedCodesNewestFirst(): SkillShareCodeEntry[] {
  return Object.values(readSkillShareCodes()).sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}

/**
 * Modal for redeeming a 6-digit skill share code. Lists locally saved codes
 * (newest first); choosing a row redeems immediately. 「使用」 redeems the
 * typed code. Both start a chat with /{skillName}.
 */
export function UseSkillCodeDialog({
  onClose,
  disabled = false,
}: {
  onClose: () => void;
  disabled?: boolean;
}) {
  const { navigate } = useNavigation();
  const { mutateAsync: createConversation, isPending } =
    useCreateConversation();
  const isCreatingElsewhere = useIsCreatingConversation();
  const isCreating = isPending || isCreatingElsewhere || disabled;

  const [codeInput, setCodeInput] = useState("");
  const [savedCodes] = useState(savedCodesNewestFirst);

  const handleRedeemCode = (rawCode?: string) => {
    if (isCreating) return;
    const trimmed = (rawCode ?? codeInput).trim();
    if (!isValidSkillShareCode(trimmed)) {
      displayErrorToast("请输入六位数字技能码");
      return;
    }
    const entry = lookupSkillShareCode(trimmed);
    if (!entry) {
      displayErrorToast("未找到该技能码，请确认后重试");
      return;
    }

    setCodeInput(trimmed);

    const toastId = toast.loading(
      `正在使用技能「${entry.skillName}」开聊…`,
      TOAST_OPTIONS,
    );

    void (async () => {
      try {
        const data = await createConversation({
          query: skillRedeemLaunchQuery(entry.skillName),
          workingDir: entry.workspacePath ?? undefined,
          workspaceMode: entry.workspacePath ? "local_repo" : undefined,
          entryPoint: "home_use_skill_code",
        });
        toast.dismiss(toastId);
        onClose();
        navigate(`/conversations/${data.conversation_id}`);
      } catch (error) {
        toast.dismiss(toastId);
        displayErrorToast(error instanceof Error ? error.message : null);
      }
    })();
  };

  return (
    <ModalBackdrop onClose={onClose} aria-label="使用技能码">
      <ModalBody
        testID="use-skill-code-dialog"
        width="md"
        className="relative items-start border border-[var(--oh-border)]"
      >
        <ModalCloseButton
          onClose={onClose}
          testId="use-skill-code-dialog-close"
        />
        <div className="w-full pr-6">
          <BaseModalTitle title="使用技能码" />
        </div>

        <div className="flex w-full items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="六位技能码"
            value={codeInput}
            onChange={(e) =>
              setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleRedeemCode();
              }
            }}
            disabled={isCreating}
            data-testid="use-skill-code-input"
            className={cn(
              "h-9 min-w-0 flex-1 rounded-lg border border-[var(--oh-border-hairline)] bg-transparent px-3 text-sm text-[var(--oh-text-secondary)] placeholder:text-[var(--oh-text-dim)]",
              "outline-none focus:border-[var(--oh-border)]",
              isCreating && "cursor-not-allowed opacity-50",
            )}
            aria-label="使用技能码"
          />
          <BrandButton
            type="button"
            variant="primary"
            testId="use-skill-code-submit"
            onClick={() => handleRedeemCode()}
            isDisabled={isCreating || codeInput.trim().length !== 6}
          >
            使用
          </BrandButton>
        </div>

        {savedCodes.length === 0 ? (
          <p
            className="text-sm text-[var(--oh-text-dim)]"
            data-testid="saved-skill-codes-empty"
          >
            暂无已保存的技能码
          </p>
        ) : (
          <ul className="flex max-h-60 w-full flex-col gap-1 overflow-y-auto">
            {savedCodes.map((entry) => (
              <li key={entry.code}>
                <button
                  type="button"
                  data-testid="saved-skill-code-row"
                  data-code={entry.code}
                  onClick={() => handleRedeemCode(entry.code)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--oh-hover-wash)]"
                >
                  <span className="font-mono tabular-nums text-[var(--oh-foreground)]">
                    {entry.code}
                  </span>
                  <span className="truncate text-[var(--oh-text-secondary)]">
                    {entry.skillName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ModalBody>
    </ModalBackdrop>
  );
}
