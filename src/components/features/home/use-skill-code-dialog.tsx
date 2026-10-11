/* eslint-disable i18next/no-literal-string -- skill-code UI: hardcoded zh-CN for now */
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Check, Share2 } from "lucide-react";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { useNavigation } from "#/context/navigation-context";
import {
  displayErrorToast,
  displaySuccessToast,
  TOAST_OPTIONS,
} from "#/utils/custom-toast-handlers";
import {
  formatSkillShareClipboardText,
  isValidSkillShareCode,
  lookupSkillShareCode,
  readSkillShareCodes,
  SKILL_SHARE_COPIED_FEEDBACK_MS,
  skillShareUserErrorMessage,
  type SkillShareCodeEntry,
} from "#/utils/skill-share-codes";
import { resolveSkillShareShortTitle } from "#/utils/resolve-skill-share-title";
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
 * Modal for redeeming a 6-digit skill share code. Lists codes this browser
 * has cached (newest first). Choosing a row or pressing 「使用」 looks the
 * code up on the server, then starts a chat with /{skillName}. The share
 * control copies a SkillsDog blurb and does not redeem.
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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const showCopiedFeedback = (code: string) => {
    setCopiedCode(code);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => {
      setCopiedCode((current) => (current === code ? null : current));
    }, SKILL_SHARE_COPIED_FEEDBACK_MS);
  };

  const handleRedeemCode = (rawCode?: string) => {
    if (isCreating) return;
    const trimmed = (rawCode ?? codeInput).trim();
    if (!isValidSkillShareCode(trimmed)) {
      displayErrorToast("请输入六位数字技能码");
      return;
    }

    setCodeInput(trimmed);
    const toastId = toast.loading("正在查询技能码…", TOAST_OPTIONS);

    void (async () => {
      let entry: SkillShareCodeEntry | null;
      try {
        entry = await lookupSkillShareCode(trimmed);
      } catch (error) {
        toast.dismiss(toastId);
        displayErrorToast(skillShareUserErrorMessage(error, "redeem"));
        return;
      }
      if (!entry) {
        toast.dismiss(toastId);
        displayErrorToast("未找到该技能码，请确认后重试");
        return;
      }

      toast.loading(`正在使用技能「${entry.skillName}」开聊…`, {
        ...TOAST_OPTIONS,
        id: toastId,
      });

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

  const handleShareCode = (
    event: React.MouseEvent<HTMLButtonElement>,
    entry: SkillShareCodeEntry,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    void (async () => {
      const { title } = await resolveSkillShareShortTitle(entry);
      const text = formatSkillShareClipboardText(entry.code, title);
      try {
        await navigator.clipboard.writeText(text);
        displaySuccessToast("已复制");
        showCopiedFeedback(entry.code);
      } catch {
        displaySuccessToast(text);
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
              <li
                key={entry.code}
                className="flex w-full items-center gap-2 rounded-lg pr-1.5 hover:bg-[var(--oh-hover-wash)]"
              >
                <button
                  type="button"
                  data-testid="saved-skill-code-row"
                  data-code={entry.code}
                  onClick={() => handleRedeemCode(entry.code)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 px-2 py-1.5 text-left text-sm"
                >
                  <span className="font-mono tabular-nums text-[var(--oh-foreground)]">
                    {entry.code}
                  </span>
                  <span className="truncate text-[var(--oh-text-secondary)]">
                    {entry.skillName}
                  </span>
                </button>
                <span
                  aria-hidden
                  data-testid="saved-skill-code-share-divider"
                  className="h-4 w-px shrink-0 bg-[var(--oh-border)]"
                />
                <button
                  type="button"
                  data-testid="saved-skill-code-share"
                  data-code={entry.code}
                  aria-label={copiedCode === entry.code ? "已复制" : "分享"}
                  title="复制分享文案"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => handleShareCode(event, entry)}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[var(--oh-border)] bg-transparent px-2 py-1 text-xs font-medium text-[var(--oh-text-secondary)] hover:bg-[var(--oh-hover-wash)] hover:text-[var(--oh-foreground)]"
                >
                  {copiedCode === entry.code ? (
                    <Check aria-hidden className="h-3 w-3" strokeWidth={2} />
                  ) : (
                    <Share2 aria-hidden className="h-3 w-3" strokeWidth={2} />
                  )}
                  {copiedCode === entry.code ? "已复制" : "分享"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </ModalBody>
    </ModalBackdrop>
  );
}
