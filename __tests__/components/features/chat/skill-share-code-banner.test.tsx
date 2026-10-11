import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";
import { SkillShareCodeBanner } from "#/components/features/chat/skill-share-code-banner";
import { useEventStore } from "#/stores/use-event-store";
import { useSkillShareCodeBannerStore } from "#/stores/skill-share-code-banner-store";
import type {
  CmdOutputMetadata,
  ExecuteBashObservation,
  ObservationEvent,
} from "#/types/agent-server/core";
import { SKILL_SHARE_CODES_STORAGE_KEY } from "#/utils/skill-share-codes";
import { renderWithProviders } from "../../../../test-utils";

const CONVERSATION_ID = "test-conversation-id";

function bashInitEvent(): ObservationEvent<ExecuteBashObservation> {
  return {
    id: "bash-skill-init",
    timestamp: new Date().toISOString(),
    source: "environment",
    tool_name: "execute_bash",
    tool_call_id: "call-bash-skill-init",
    action_id: "action-bash-skill-init",
    observation: {
      kind: "ExecuteBashObservation",
      content: [
        {
          type: "text",
          text: "✅ Skill 'my-skill' initialized successfully at /tmp/ws/.agents/skills/my-skill",
        },
      ],
      command: "python3 init_skill.py my-skill --path /tmp/ws/.agents/skills",
      exit_code: 0,
      error: false,
      timeout: false,
      metadata: {} as CmdOutputMetadata,
    },
  };
}

describe("SkillShareCodeBanner", () => {
  afterEach(() => {
    window.localStorage.removeItem(SKILL_SHARE_CODES_STORAGE_KEY);
    useEventStore.getState().clearEvents();
    useSkillShareCodeBannerStore.setState({ dismissedEventIds: {} });
    toast.remove();
    vi.unstubAllGlobals();
  });

  it("shows a mint button after skill-creator init without auto-minting", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: "482913",
        skillName: "my-skill",
        skillPath: "/tmp/ws/.agents/skills/my-skill",
        workspacePath: "/tmp/ws",
        skillTitle: null,
        createdAt: 10,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    useEventStore.getState().clearEventsForConversation(CONVERSATION_ID);
    useEventStore.getState().addEvent(bashInitEvent());

    renderWithProviders(
      <SkillShareCodeBanner conversationId={CONVERSATION_ID} />,
    );

    expect(
      await screen.findByTestId("skill-share-code-banner"),
    ).toHaveTextContent("技能「my-skill」已就绪");
    expect(screen.getByTestId("skill-share-code-mint")).toHaveTextContent(
      "生成技能码",
    );
    expect(
      screen.queryByTestId("skill-share-code-value"),
    ).not.toBeInTheDocument();

    // Detection alone must not call the mint API.
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it("mints the code only after the user clicks 生成技能码", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: "482913",
        skillName: "my-skill",
        skillPath: "/tmp/ws/.agents/skills/my-skill",
        workspacePath: "/tmp/ws",
        skillTitle: null,
        createdAt: 10,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    useEventStore.getState().clearEventsForConversation(CONVERSATION_ID);
    useEventStore.getState().addEvent(bashInitEvent());
    const user = userEvent.setup();

    renderWithProviders(
      <SkillShareCodeBanner conversationId={CONVERSATION_ID} />,
    );

    await user.click(await screen.findByTestId("skill-share-code-mint"));

    expect(
      await screen.findByTestId("skill-share-code-value"),
    ).toHaveTextContent("482913");
    expect(screen.getByTestId("skill-share-code-copy")).toBeInTheDocument();
    expect(
      screen.queryByTestId("skill-share-code-mint"),
    ).not.toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/canvas/skill-share-codes");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      skillName: "my-skill",
      skillPath: "/tmp/ws/.agents/skills/my-skill",
    });
  });
});
