import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";
import { SkillShareCodeControls } from "#/components/features/home/skill-share-code-controls";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import SkillsService from "#/api/skills-service";
import type { SkillInfo } from "#/types/settings";
import {
  SKILL_SHARE_CODES_STORAGE_KEY,
  SKILL_SHARE_COPIED_FEEDBACK_MS,
  lookupSkillShareCode,
  writeSkillShareCodes,
  type SkillShareCodeEntry,
} from "#/utils/skill-share-codes";
import { renderWithProviders } from "../../../../test-utils";

function entry(
  code: string,
  skillName: string,
  createdAt: number,
  extras: Partial<SkillShareCodeEntry> = {},
): SkillShareCodeEntry {
  return {
    code,
    skillName,
    skillPath: null,
    workspacePath: null,
    createdAt,
    ...extras,
  };
}

function skillWithMarkdown(
  name: string,
  content: string,
  description?: string,
): SkillInfo {
  return {
    name,
    type: "agentskills",
    source: null,
    description,
    content,
  };
}

function makeConversationResponse(): never {
  return {
    id: "conv-skill",
    created_by_user_id: null,
    status: "READY",
    detail: null,
    app_conversation_id: "conv-skill",
    agent_server_url: "http://agent-server.local",
    request: { initial_message: undefined, plugins: null },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as never;
}

describe("SkillShareCodeControls", () => {
  afterEach(() => {
    window.localStorage.removeItem(SKILL_SHARE_CODES_STORAGE_KEY);
    toast.remove();
    vi.restoreAllMocks();
  });

  it("opens a redeem dialog from 使用技能码 with empty saved list", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<SkillShareCodeControls />);

    expect(screen.getByTestId("create-skill-code-button")).toBeInTheDocument();
    expect(
      screen.queryByTestId("use-skill-code-input"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId("use-skill-code-button"));

    expect(screen.getByTestId("use-skill-code-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("use-skill-code-input")).toBeInTheDocument();
    expect(screen.getByTestId("saved-skill-codes-empty")).toHaveTextContent(
      "暂无已保存的技能码",
    );
  });

  it("lists saved codes newest-first and redeems on row click", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);
    writeSkillShareCodes({
      "111111": entry("111111", "older-skill", 1),
      "222222": entry("222222", "newer-skill", 2),
    });
    const createSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
      .mockResolvedValue(makeConversationResponse());
    const navigate = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<SkillShareCodeControls />, {
      navigation: { navigate },
    });

    await user.click(screen.getByTestId("use-skill-code-button"));

    const rows = screen.getAllByTestId("saved-skill-code-row");
    expect(rows.map((row) => row.getAttribute("data-code"))).toEqual([
      "222222",
      "111111",
    ]);
    expect(rows[0]).toHaveTextContent("newer-skill");

    await user.click(rows[0]);

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialUserMsg: "/newer-skill\n\n请全程用简体中文与我交流。",
      }),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/conversations/conv-skill"),
    );
  });

  it("copies the Chinese short title from a distinct share button without redeeming", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([
      skillWithMarkdown(
        "demo-skill",
        `---
name: demo-skill
description: 这是一段很长的 YAML 描述，不应该出现在分享文案里
---
# 100 字短文体写作

正文
`,
        "这是一段很长的 YAML 描述，不应该出现在分享文案里",
      ),
    ]);
    writeSkillShareCodes({
      "482913": entry("482913", "demo-skill", 1, {
        skillPath: "/tmp/ws/.agents/skills/demo-skill",
      }),
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
    const createSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
      .mockResolvedValue(makeConversationResponse());
    const successSpy = vi.spyOn(toast, "success");
    const scheduled: Array<{ fn: TimerHandler; ms?: number }> = [];
    const realSetTimeout = window.setTimeout.bind(window);
    vi.spyOn(window, "setTimeout").mockImplementation(((
      fn: TimerHandler,
      ms?: number,
      ...args: unknown[]
    ) => {
      if (ms === SKILL_SHARE_COPIED_FEEDBACK_MS) {
        scheduled.push({ fn, ms });
        return 1 as unknown as ReturnType<typeof setTimeout>;
      }
      return realSetTimeout(fn, ms, ...args);
    }) as typeof window.setTimeout);
    const user = userEvent.setup();

    renderWithProviders(<SkillShareCodeControls />);
    await user.click(screen.getByTestId("use-skill-code-button"));

    const row = screen.getByTestId("saved-skill-code-row");
    const share = screen.getByTestId("saved-skill-code-share");
    expect(row).not.toContainElement(share);
    expect(
      row.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByTestId("saved-skill-code-share-divider"),
    ).toBeInTheDocument();
    expect(share.className).toContain("border");
    expect(share).toHaveAttribute("aria-label", "分享");
    expect(share).toHaveAttribute("title", "复制分享文案");
    expect(share).toHaveTextContent("分享");

    await user.click(share);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "SkillsDog 技能码：482913（100 字短文体写作） — https://skillsdog.com",
      ),
    );
    expect(createSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("use-skill-code-dialog")).toBeInTheDocument();
    const toastContent = successSpy.mock.calls[0]?.[0] as {
      props?: { children?: string };
    };
    expect(toastContent.props?.children).toBe("已复制");
    expect(share).toHaveTextContent("已复制");
    expect(share).toHaveAttribute("aria-label", "已复制");
    expect(lookupSkillShareCode("482913")?.skillTitle).toBe("100 字短文体写作");

    await act(async () => {
      const pending = scheduled.find(
        (item) => item.ms === SKILL_SHARE_COPIED_FEEDBACK_MS,
      );
      if (typeof pending?.fn === "function") pending.fn();
    });
    expect(share).toHaveTextContent("分享");
    expect(share).not.toHaveTextContent("已复制");
  });

  it("falls back to the stored title when SKILL.md has no short heading", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([
      skillWithMarkdown(
        "demo-skill",
        "---\ndescription: long yaml description\n---\n\nNo heading here.\n",
        "long yaml description",
      ),
    ]);
    writeSkillShareCodes({
      "482913": entry("482913", "demo-skill", 1, {
        skillTitle: "已存标题",
      }),
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
    const user = userEvent.setup();

    renderWithProviders(<SkillShareCodeControls />);
    await user.click(screen.getByTestId("use-skill-code-button"));
    await user.click(screen.getByTestId("saved-skill-code-share"));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "SkillsDog 技能码：482913（已存标题） — https://skillsdog.com",
      ),
    );
  });
});
