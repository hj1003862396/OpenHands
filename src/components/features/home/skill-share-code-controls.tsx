/* eslint-disable i18next/no-literal-string -- skill-code UI: hardcoded zh-CN for now */
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Sparkles } from "lucide-react";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { useNavigation } from "#/context/navigation-context";
import { useSkills } from "#/hooks/query/use-skills";
import { getSkillScope } from "#/utils/skill-scope";
import {
  displayErrorToast,
  displaySuccessToast,
  TOAST_OPTIONS,
} from "#/utils/custom-toast-handlers";
import {
  findCodeForSkillName,
  mintSkillShareCode,
} from "#/utils/skill-share-codes";
import { markSkillSharePendingConversation } from "#/utils/skill-creator-events";
import { cn } from "#/utils/utils";
import { formControlTransitionClassName } from "#/utils/form-control-classes";
import { UseSkillCodeDialog } from "./use-skill-code-dialog";

const SKILL_CREATOR_LAUNCH_QUERY =
  "/skill-creator\n\n请全程用简体中文与我交流，并创建技能。";

const pillButtonClassName = cn(
  "inline-flex flex-row items-center gap-1 rounded-full border border-transparent bg-transparent px-2 py-0.5",
  "text-xs font-normal leading-4 text-[var(--oh-muted)]",
  formControlTransitionClassName,
);

/**
 * Home-page controls for minting / redeeming 6-digit skill share codes.
 * 「创建技能码」 launches a conversation that invokes the built-in
 * skill-creator skill; codes are auto-minted when that flow scaffolds a
 * skill (see SkillShareCodeBanner). 「使用技能码」 opens a dialog that
 * redeems a code into a new chat that starts with /{skillName}. A small
 * fallback lets the user mint a code for an already-listed user/project
 * skill when auto-detect was missed.
 */
export function SkillShareCodeControls({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const { navigate } = useNavigation();
  const { mutateAsync: createConversation, isPending } =
    useCreateConversation();
  const isCreatingElsewhere = useIsCreatingConversation();
  const isCreating = isPending || isCreatingElsewhere || disabled;

  const [useSkillCodeOpen, setUseSkillCodeOpen] = useState(false);
  const [mintSkillName, setMintSkillName] = useState("");
  const { data: skills } = useSkills();

  const mintableSkills = useMemo(() => {
    if (!skills) return [];
    return skills
      .filter((skill) => {
        const scope = getSkillScope(skill);
        return scope === "personal" || scope === "project";
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [skills]);

  const handleCreateSkillCode = () => {
    if (isCreating) return;

    const toastId = toast.loading("正在启动 skill-creator…", TOAST_OPTIONS);

    void (async () => {
      try {
        const data = await createConversation({
          query: SKILL_CREATOR_LAUNCH_QUERY,
          entryPoint: "home_create_skill_code",
        });
        toast.dismiss(toastId);
        markSkillSharePendingConversation(data.conversation_id);
        displaySuccessToast(
          "已启动 skill-creator。创建完成后会自动显示六位技能码。",
        );
        navigate(`/conversations/${data.conversation_id}`);
      } catch (error) {
        toast.dismiss(toastId);
        displayErrorToast(error instanceof Error ? error.message : null);
      }
    })();
  };

  const handleMintForExisting = () => {
    if (!mintSkillName) {
      displayErrorToast("请先选择要生成技能码的技能");
      return;
    }
    const skill = mintableSkills.find((s) => s.name === mintSkillName);
    if (!skill) {
      displayErrorToast("未找到该技能");
      return;
    }
    const prior = findCodeForSkillName(skill.name);
    if (prior) {
      displaySuccessToast(`技能「${skill.name}」的技能码：${prior.code}`);
      return;
    }
    const entry = mintSkillShareCode({
      skillName: skill.name,
      skillPath: skill.source,
    });
    displaySuccessToast(`已为「${skill.name}」生成技能码：${entry.code}`);
  };

  return (
    <div
      className="flex w-full flex-col gap-2"
      data-testid="skill-share-code-controls"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="create-skill-code-button"
          onClick={handleCreateSkillCode}
          disabled={isCreating}
          className={cn(
            pillButtonClassName,
            isCreating
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:bg-[var(--oh-hover-wash)] hover:text-[var(--oh-foreground)]",
          )}
        >
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
            <Sparkles aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <span>创建技能码</span>
        </button>

        <button
          type="button"
          data-testid="use-skill-code-button"
          onClick={() => setUseSkillCodeOpen(true)}
          disabled={isCreating}
          className={cn(
            pillButtonClassName,
            isCreating
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:bg-[var(--oh-hover-wash)] hover:text-[var(--oh-foreground)]",
          )}
        >
          <span>使用技能码</span>
        </button>
      </div>

      {mintableSkills.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            data-testid="mint-skill-select"
            value={mintSkillName}
            onChange={(e) => setMintSkillName(e.target.value)}
            disabled={isCreating}
            className={cn(
              "h-7 max-w-[14rem] rounded-full border border-[var(--oh-border-hairline)] bg-transparent px-2 text-xs text-[var(--oh-text-secondary)]",
              isCreating && "cursor-not-allowed opacity-50",
            )}
            aria-label="为已有技能生成码"
          >
            <option value="">为已有技能生成码…</option>
            {mintableSkills.map((skill) => (
              <option
                key={`${skill.source ?? ""}:${skill.name}`}
                value={skill.name}
              >
                {skill.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="mint-skill-code-button"
            onClick={handleMintForExisting}
            disabled={isCreating || !mintSkillName}
            className={cn(
              pillButtonClassName,
              isCreating || !mintSkillName
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:bg-[var(--oh-hover-wash)] hover:text-[var(--oh-foreground)]",
            )}
          >
            <span>生成技能码</span>
          </button>
        </div>
      ) : null}

      {useSkillCodeOpen ? (
        <UseSkillCodeDialog
          disabled={isCreating}
          onClose={() => setUseSkillCodeOpen(false)}
        />
      ) : null}
    </div>
  );
}
