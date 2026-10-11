import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SKILL_SHARE_CODES_STORAGE_KEY,
  chooseSkillShareTitle,
  deriveWorkspacePathFromSkillPath,
  extractSkillShortTitle,
  formatSkillShareClipboardText,
  generateSixDigitCode,
  isValidSkillShareCode,
  lookupCachedSkillShareCode,
  lookupSkillShareCode,
  mintSkillShareCode,
  readSkillShareCodes,
  skillShareUserErrorMessage,
  writeSkillShareCodes,
} from "#/utils/skill-share-codes";
import { SkillShareApiError } from "#/api/skill-share-codes-client";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
  } as Response;
}

afterEach(() => {
  window.localStorage.removeItem(SKILL_SHARE_CODES_STORAGE_KEY);
  vi.unstubAllGlobals();
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

  it("mints through the server and caches the returned code", async () => {
    const minted = {
      code: "482913",
      skillName: "my-skill",
      skillPath: "/tmp/ws/.agents/skills/my-skill",
      workspacePath: "/tmp/ws",
      skillTitle: null,
      createdAt: 10,
    };
    const titled = { ...minted, skillTitle: "100 字短文体写作" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, minted))
      .mockResolvedValueOnce(jsonResponse(200, titled))
      .mockResolvedValueOnce(jsonResponse(200, titled));
    vi.stubGlobal("fetch", fetchMock);

    const entry = await mintSkillShareCode({
      skillName: "my-skill",
      skillPath: "/tmp/ws/.agents/skills/my-skill",
    });
    expect(entry.code).toBe("482913");
    expect(entry.skillName).toBe("my-skill");
    expect(entry.workspacePath).toBe("/tmp/ws");
    expect(Object.keys(readSkillShareCodes())).toEqual([entry.code]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/canvas/skill-share-codes",
      expect.objectContaining({ method: "POST" }),
    );

    const again = await mintSkillShareCode({
      skillName: "my-skill",
      skillPath: "/tmp/ws/.agents/skills/my-skill",
      skillTitle: "100 字短文体写作",
    });
    expect(again.code).toBe(entry.code);
    expect(again.skillTitle).toBe("100 字短文体写作");
    expect(readSkillShareCodes()[entry.code]?.skillTitle).toBe(
      "100 字短文体写作",
    );

    await expect(lookupSkillShareCode(entry.code)).resolves.toMatchObject({
      skillName: "my-skill",
      skillTitle: "100 字短文体写作",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/canvas/skill-share-codes/482913",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("does not redeem a code that exists only in localStorage", async () => {
    writeSkillShareCodes({
      "999999": {
        code: "999999",
        skillName: "local-only",
        skillPath: null,
        workspacePath: null,
        createdAt: 1,
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(404, {
          error: "not_found",
          message: "Unknown skill share code",
        }),
      ),
    );

    await expect(lookupSkillShareCode("999999")).resolves.toBeNull();
    expect(lookupCachedSkillShareCode("999999")?.skillName).toBe("local-only");
  });

  it("surfaces a MySQL configuration failure instead of the local cache", () => {
    expect(
      skillShareUserErrorMessage(
        new SkillShareApiError(503, "mysql_unconfigured", "missing"),
        "redeem",
      ),
    ).toBe("技能码服务未配置 MySQL，无法兑换");
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

  it("returns null for unknown cached codes", () => {
    writeSkillShareCodes({});
    expect(lookupCachedSkillShareCode("999999")).toBeNull();
  });
});
