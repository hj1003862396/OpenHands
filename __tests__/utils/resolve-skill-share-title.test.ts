import { afterEach, describe, expect, it, vi } from "vitest";
import type { SkillInfo } from "#/types/settings";
import { resolveSkillShareShortTitle } from "#/utils/resolve-skill-share-title";
import {
  SKILL_SHARE_CODES_STORAGE_KEY,
  lookupSkillShareCode,
  writeSkillShareCodes,
  type SkillShareCodeEntry,
} from "#/utils/skill-share-codes";

afterEach(() => {
  window.localStorage.removeItem(SKILL_SHARE_CODES_STORAGE_KEY);
});

function entry(
  overrides: Partial<SkillShareCodeEntry> = {},
): SkillShareCodeEntry {
  return {
    code: "482913",
    skillName: "short-form",
    skillPath: "/tmp/ws/.agents/skills/short-form",
    workspacePath: "/tmp/ws",
    createdAt: 1,
    ...overrides,
  };
}

function skill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    name: "short-form",
    type: "agentskills",
    source: "/tmp/ws/.agents/skills/short-form",
    description: "很长的 YAML 描述，不能当短标题",
    ...overrides,
  };
}

describe("resolveSkillShareShortTitle", () => {
  it("uses the skills-list H1 instead of the YAML description", async () => {
    const saved = entry();
    writeSkillShareCodes({ [saved.code]: saved });
    const readSkillMarkdown = vi.fn();

    const choice = await resolveSkillShareShortTitle(saved, {
      loadSkills: async () => [
        skill({
          content:
            "---\ndescription: 很长的 YAML 描述\n---\n# 100 字短文体写作\n",
        }),
      ],
      readSkillMarkdown,
    });

    expect(choice).toEqual({
      title: "100 字短文体写作",
      fromMarkdown: true,
    });
    expect(readSkillMarkdown).not.toHaveBeenCalled();
    expect(lookupSkillShareCode(saved.code)?.skillTitle).toBe(
      "100 字短文体写作",
    );
  });

  it("reads SKILL.md when the skills list has no H1", async () => {
    const saved = entry();
    writeSkillShareCodes({ [saved.code]: saved });
    const readSkillMarkdown = vi
      .fn()
      .mockResolvedValue("# 文件里的短标题\n\nbody");

    const choice = await resolveSkillShareShortTitle(saved, {
      loadSkills: async () => [
        skill({
          content: "---\ndescription: 很长的描述\n---\n\n没有标题\n",
        }),
      ],
      readSkillMarkdown,
    });

    expect(readSkillMarkdown).toHaveBeenCalledWith(saved.skillPath);
    expect(choice.title).toBe("文件里的短标题");
  });

  it.each([
    {
      label: "stored title",
      saved: entry({ skillTitle: "已存标题" }),
      skills: [skill({ name: "api-display", content: "没有标题" })],
      title: "已存标题",
    },
    {
      label: "skills API display name",
      saved: entry({ skillTitle: null }),
      skills: [skill({ name: "api-display", content: "没有标题" })],
      title: "api-display",
    },
    {
      label: "English skill name",
      saved: entry({ skillPath: null, skillTitle: null }),
      skills: [] as SkillInfo[],
      title: "short-form",
    },
  ])(
    "falls back to $label when no short heading exists",
    async ({ saved, skills, title }) => {
      writeSkillShareCodes({ [saved.code]: saved });
      const choice = await resolveSkillShareShortTitle(saved, {
        loadSkills: async () => skills,
        readSkillMarkdown: async () => "没有标题",
      });
      expect(choice).toEqual({ title, fromMarkdown: false });
    },
  );
});
