import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";
import { SkillShareCodeControls } from "#/components/features/home/skill-share-code-controls";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import SkillsService from "#/api/skills-service";
import {
  SKILL_SHARE_CODES_STORAGE_KEY,
  writeSkillShareCodes,
  type SkillShareCodeEntry,
} from "#/utils/skill-share-codes";
import { renderWithProviders } from "../../../../test-utils";

function entry(
  code: string,
  skillName: string,
  createdAt: number,
): SkillShareCodeEntry {
  return {
    code,
    skillName,
    skillPath: null,
    workspacePath: null,
    createdAt,
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

  it("opens a dialog from 使用技能码 and shows an empty saved-code list", async () => {
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

  it("fills the input from a saved code and redeems it into a conversation", async () => {
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
    expect(screen.getByTestId("use-skill-code-input")).toHaveValue("222222");

    await user.click(screen.getByTestId("use-skill-code-submit"));

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
});
