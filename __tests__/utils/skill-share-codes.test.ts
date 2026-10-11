import { afterEach, describe, expect, it } from "vitest";
import {
  SKILL_SHARE_CODES_STORAGE_KEY,
  chooseSkillShareTitle,
  deriveWorkspacePathFromSkillPath,
  extractSkillShortTitle,
  formatSkillShareClipboardText,
  generateSixDigitCode,
  isValidSkillShareCode,
  lookupSkillShareCode,
  mintSkillShareCode,
  readSkillShareCodes,
  writeSkillShareCodes,
} from "#/utils/skill-share-codes";

afterEach(() => {
  window.localStorage.removeItem(SKILL_SHARE_CODES_STORAGE_KEY);
});

describe("skill-share-codes", () => {
  it("generates unique zero-padded 6-digit codes", () => {
    const existing = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const code = generateSixDigitCode(existing);
      expect(code).toMatch(/^\d{6}$/);
      expect(existing.has(code)).toBe(false);
      existing.add(code);
    }
  });

  it("validates six-digit codes only", () => {
    expect(isValidSkillShareCode("123456")).toBe(true);
    expect(isValidSkillShareCode(" 000001 ")).toBe(true);
    expect(isValidSkillShareCode("12345")).toBe(false);
    expect(isValidSkillShareCode("1234567")).toBe(false);
    expect(isValidSkillShareCode("12a456")).toBe(false);
  });

  it("derives project workspace paths and ignores personal skills", () => {
    expect(
      deriveWorkspacePathFromSkillPath("/tmp/demo-ws/.agents/skills/my-skill"),
    ).toBe("/tmp/demo-ws");
    expect(
      deriveWorkspacePathFromSkillPath("/home/alice/.agents/skills/my-skill"),
    ).toBeNull();
    expect(deriveWorkspacePathFromSkillPath(null)).toBeNull();
  });

  it("mints, persists, and looks up a share code", () => {
    const entry = mintSkillShareCode({
      skillName: "my-skill",
      skillPath: "/tmp/ws/.agents/skills/my-skill",
    });
    expect(entry.code).toMatch(/^\d{6}$/);
    expect(entry.skillName).toBe("my-skill");
    expect(entry.workspacePath).toBe("/tmp/ws");
    expect(lookupSkillShareCode(entry.code)?.skillName).toBe("my-skill");
    expect(Object.keys(readSkillShareCodes())).toEqual([entry.code]);

    // Idempotent for same skill+path
    const again = mintSkillShareCode({
      skillName: "my-skill",
      skillPath: "/tmp/ws/.agents/skills/my-skill",
    });
    expect(again.code).toBe(entry.code);

    const titled = mintSkillShareCode({
      skillName: "my-skill",
      skillPath: "/tmp/ws/.agents/skills/my-skill",
      skillTitle: "100 字短文体写作",
    });
    expect(titled.code).toBe(entry.code);
    expect(titled.skillTitle).toBe("100 字短文体写作");
    expect(lookupSkillShareCode(entry.code)?.skillTitle).toBe(
      "100 字短文体写作",
    );
  });

  it("extracts the first H1 and ignores YAML description and deeper headings", () => {
    const markdown = `---
name: short-form
description: |
  这是一段很长的描述，不是短标题
---
\`\`\`
# 围栏里的标题
\`\`\`
## 小节
# 100 字短文体写作

正文
`;
    expect(extractSkillShortTitle(markdown)).toBe("100 字短文体写作");
    expect(extractSkillShortTitle("## only a section")).toBeNull();
    expect(
      chooseSkillShareTitle({
        skillName: "short-form",
        storedTitle: "已存标题",
        markdown: ["## no h1\n\nlong body"],
        apiDisplay: "api-display",
      }),
    ).toEqual({ title: "已存标题", fromMarkdown: false });
    expect(
      chooseSkillShareTitle({
        skillName: "short-form",
        apiDisplay: "api-display",
      }),
    ).toEqual({ title: "api-display", fromMarkdown: false });
    expect(chooseSkillShareTitle({ skillName: "short-form" })).toEqual({
      title: "short-form",
      fromMarkdown: false,
    });
    expect(formatSkillShareClipboardText("482913", "100 字短文体写作")).toBe(
      "SkillsDog 技能码：482913（100 字短文体写作） — https://skillsdog.com",
    );
  });

  it("returns null for unknown codes", () => {
    writeSkillShareCodes({});
    expect(lookupSkillShareCode("999999")).toBeNull();
  });
});
