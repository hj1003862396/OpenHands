import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";
import { useSkillCreatorShareCodes } from "#/hooks/use-skill-creator-share-codes";
import { useEventStore } from "#/stores/use-event-store";
import { useSkillShareCodeBannerStore } from "#/stores/skill-share-code-banner-store";
import type {
  CmdOutputMetadata,
  ExecuteBashObservation,
  ObservationEvent,
} from "#/types/agent-server/core";
import {
  SKILL_SHARE_CODES_STORAGE_KEY,
  writeSkillShareCodes,
} from "#/utils/skill-share-codes";

const CONVERSATION_ID = "hook-conversation-id";

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
          text: "✅ Skill 'demo' initialized successfully at /tmp/ws/.agents/skills/demo",
        },
      ],
      command: "python3 init_skill.py demo --path /tmp/ws/.agents/skills",
      exit_code: 0,
      error: false,
      timeout: false,
      metadata: {} as CmdOutputMetadata,
    },
  };
}

describe("useSkillCreatorShareCodes", () => {
  afterEach(() => {
    window.localStorage.removeItem(SKILL_SHARE_CODES_STORAGE_KEY);
    useEventStore.getState().clearEvents();
    useSkillShareCodeBannerStore.setState({ dismissedEventIds: {} });
    toast.remove();
    vi.unstubAllGlobals();
  });

  it("detects scaffolded skills without auto-minting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useEventStore.getState().clearEventsForConversation(CONVERSATION_ID);
    useEventStore.getState().addEvent(bashInitEvent());

    const { result } = renderHook(() =>
      useSkillCreatorShareCodes(CONVERSATION_ID),
    );

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]).toMatchObject({
      eventId: "bash-skill-init",
      skillName: "demo",
      skillPath: "/tmp/ws/.agents/skills/demo",
      entry: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mints on mintCode and surfaces the entry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: "123456",
        skillName: "demo",
        skillPath: "/tmp/ws/.agents/skills/demo",
        workspacePath: "/tmp/ws",
        skillTitle: null,
        createdAt: 1,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    useEventStore.getState().clearEventsForConversation(CONVERSATION_ID);
    useEventStore.getState().addEvent(bashInitEvent());

    const { result } = renderHook(() =>
      useSkillCreatorShareCodes(CONVERSATION_ID),
    );

    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.mintCode("bash-skill-init");
    });

    await waitFor(() =>
      expect(result.current.items[0]?.entry?.code).toBe("123456"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses a locally cached code without calling mint again on click", async () => {
    writeSkillShareCodes({
      "999888": {
        code: "999888",
        skillName: "demo",
        skillPath: "/tmp/ws/.agents/skills/demo",
        workspacePath: "/tmp/ws",
        skillTitle: null,
        createdAt: 1,
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useEventStore.getState().clearEventsForConversation(CONVERSATION_ID);
    useEventStore.getState().addEvent(bashInitEvent());

    const { result } = renderHook(() =>
      useSkillCreatorShareCodes(CONVERSATION_ID),
    );

    await waitFor(() =>
      expect(result.current.items[0]?.entry?.code).toBe("999888"),
    );

    await act(async () => {
      await result.current.mintCode("bash-skill-init");
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
