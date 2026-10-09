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
  isValidSkillShareCode,
  lookupSkillShareCode,
  mintSkillShareCode,
} from "#/utils/skill-share-codes";
import { markSkillSharePendingConversation } from "#/utils/skill-creator-events";
import { cn } from "#/utils/utils";
import {
  formControlBorderClassName,
  formControlSurfaceClassName,
  formControlTransitionClassName,
} from "#/utils/form-control-classes";

const SKILL_CREATOR_LAUNCH_QUERY = "/skill-creator";

const pillButtonClassName = cn(
  "flex flex-row items-center gap-2 rounded-full px-2.5 py-1 text-white",
  formControlBorderClassName,
  formControlSurfaceClassName,
  formControlTransitionClassName,
);

/**
 * Home-page controls for minting / redeeming 6-digit skill share codes.
 * 「创建技能码」 launches a conversation that invokes the built-in
 * skill-creator skill; codes are auto-minted when that flow scaffolds a
 * skill (see SkillShareCodeBanner). 「使用技能码」 redeems a code into a
 * new chat that starts with /{skillName}. A small fallback lets the user
 * mint a code for an already-listed user/project skill when auto-detect
 * was missed.
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

  const [codeInput, setCodeInput] = useState("");
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

  const handleRedeemCode = () => {
    if (isCreating) return;
    const trimmed = codeInput.trim();
    if (!isValidSkillShareCode(trimmed)) {
      displayErrorToast("请输入六位数字技能码");
      return;
    }
    const entry = lookupSkillShareCode(trimmed);
    if (!entry) {
      displayErrorToast("未找到该技能码，请确认后重试");
      return;
    }

    const toastId = toast.loading(
      `正在使用技能「${entry.skillName}」开聊…`,
      TOAST_OPTIONS,
    );

    void (async () => {
      try {
        const data = await createConversation({
          query: `/${entry.skillName}`,
          workingDir: entry.workspacePath ?? undefined,
          workspaceMode: entry.workspacePath ? "local_repo" : undefined,
          entryPoint: "home_use_skill_code",
        });
        toast.dismiss(toastId);
        setCodeInput("");
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
              : "cursor-pointer hover:bg-surface-raised",
          )}
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            <Sparkles aria-hidden className="h-4 w-4" strokeWidth={2} />
          </span>
          <span className="text-sm font-normal leading-5">创建技能码</span>
        </button>

        <div className="flex flex-row items-center gap-1.5">
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
              "h-8 w-[7.5rem] rounded-full px-3 text-sm text-white placeholder:text-white/40",
              formControlBorderClassName,
              formControlSurfaceClassName,
              "outline-none focus:border-white/40",
              isCreating && "cursor-not-allowed opacity-50",
            )}
            aria-label="使用技能码"
          />
          <button
            type="button"
            data-testid="use-skill-code-button"
            onClick={handleRedeemCode}
            disabled={isCreating || codeInput.trim().length !== 6}
            className={cn(
              pillButtonClassName,
              isCreating || codeInput.trim().length !== 6
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:bg-surface-raised",
            )}
          >
            <span className="text-sm font-normal leading-5">使用技能码</span>
          </button>
        </div>
      </div>

      {mintableSkills.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            data-testid="mint-skill-select"
            value={mintSkillName}
            onChange={(e) => setMintSkillName(e.target.value)}
            disabled={isCreating}
            className={cn(
              "h-8 max-w-[14rem] rounded-full px-2.5 text-sm text-white",
              formControlBorderClassName,
              formControlSurfaceClassName,
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
                : "cursor-pointer hover:bg-surface-raised",
            )}
          >
            <span className="text-sm font-normal leading-5">生成技能码</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
