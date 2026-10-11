import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    vi.unstubAllGlobals();
  });

  it("shows the code returned by the server after skill-creator init", async () => {
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
      await screen.findByTestId("skill-share-code-value"),
    ).toHaveTextContent("482913");
    expect(screen.getByTestId("skill-share-code-banner")).toHaveTextContent(
      "技能「my-skill」已创建",
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/canvas/skill-share-codes");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      skillName: "my-skill",
      skillPath: "/tmp/ws/.agents/skills/my-skill",
    });
  });
});
