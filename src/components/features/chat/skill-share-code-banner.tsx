/* eslint-disable i18next/no-literal-string -- skill-code UI: hardcoded zh-CN for now */
import { X } from "lucide-react";
import { useSkillCreatorShareCodes } from "#/hooks/use-skill-creator-share-codes";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";

export interface SkillShareCodeBannerProps {
  conversationId: string | null | undefined;
}

/**
 * Shown after skill-creator scaffolds a skill. Displays the auto-minted
 * 6-digit share code so the user can redeem it later from the home page.
 */
export function SkillShareCodeBanner({
  conversationId,
}: SkillShareCodeBannerProps) {
  const { items, dismissAll } = useSkillCreatorShareCodes(conversationId);

  if (items.length === 0) return null;

  const latest = items[items.length - 1];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(latest.entry.code);
      displaySuccessToast(`技能码 ${latest.entry.code} 已复制`);
    } catch {
      displaySuccessToast(`技能码：${latest.entry.code}`);
    }
  };

  return (
    <div
      className="flex w-full items-start gap-3 rounded-lg border-2 border-emerald-500/60 bg-emerald-500/10 p-3 text-[var(--oh-foreground)] shadow-sm"
      data-testid="skill-share-code-banner"
      role="status"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--oh-foreground)]">
          技能「{latest.skillName}」已创建
        </p>
        <p className="mt-1 text-sm text-[var(--oh-foreground)]">
          技能码：
          <span
            className="ml-2 inline-block rounded bg-black/40 px-2 py-0.5 font-mono text-lg font-semibold tracking-[0.35em] text-emerald-300"
            data-testid="skill-share-code-value"
          >
            {latest.entry.code}
          </span>
        </p>
        <p className="mt-1 text-xs text-[var(--oh-muted)]">
          回到首页，在「使用技能码」中输入该六位数字即可挂上此技能开聊。
        </p>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="mt-2 cursor-pointer rounded-md border border-emerald-500/50 bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-[var(--oh-foreground)] hover:bg-emerald-500/30"
          data-testid="skill-share-code-copy"
        >
          复制技能码
        </button>
      </div>
      <button
        type="button"
        onClick={dismissAll}
        className="shrink-0 cursor-pointer rounded-md p-1 text-[var(--oh-muted)] hover:bg-[var(--oh-interactive-hover)] hover:text-[var(--oh-foreground)]"
        aria-label="关闭"
        data-testid="skill-share-code-dismiss"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
