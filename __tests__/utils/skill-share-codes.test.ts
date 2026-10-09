import { afterEach, describe, expect, it } from "vitest";
import {
  SKILL_SHARE_CODES_STORAGE_KEY,
  deriveWorkspacePathFromSkillPath,
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
      deriveWorkspacePathFromSkillPath(
        "/tmp/demo-ws/.agents/skills/my-skill",
      ),
    ).toBe("/tmp/demo-ws");
    expect(
      deriveWorkspacePathFromSkillPath(
        "/home/alice/.agents/skills/my-skill",
      ),
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
  });

  it("returns null for unknown codes", () => {
    writeSkillShareCodes({});
    expect(lookupSkillShareCode("999999")).toBeNull();
  });
});
