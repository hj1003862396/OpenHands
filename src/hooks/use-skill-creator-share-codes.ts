import { useCallback, useMemo, useRef, useState } from "react";
import { useEventStore } from "#/stores/use-event-store";
import { useSkillShareCodeBannerStore } from "#/stores/skill-share-code-banner-store";
import { isObservationEvent } from "#/types/agent-server/type-guards";
import type { OpenHandsEvent } from "#/types/agent-server/core";
import {
  detectSkillCreatorInits,
  isSkillSharePendingConversation,
} from "#/utils/skill-creator-events";
import {
  extractSkillShortTitle,
  mintSkillShareCode,
  readSkillShareCodes,
  skillShareUserErrorMessage,
  type SkillShareCodeEntry,
} from "#/utils/skill-share-codes";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

function skillTitleFromEvents(
  events: OpenHandsEvent[],
  eventId: string,
): string | null {
  const event = events.find((item) => item.id === eventId);
  if (!event || !isObservationEvent(event)) return null;
  const observation = event.observation as { new_content?: unknown };
  if (typeof observation.new_content !== "string") return null;
  return extractSkillShortTitle(observation.new_content);
}

/** Prefer an existing local cache entry for this skill (path match first). */
function cachedEntryForSkill(
  skillName: string,
  skillPath: string,
): SkillShareCodeEntry | null {
  const entries = Object.values(readSkillShareCodes());
  return (
    entries.find(
      (entry) =>
        entry.skillName === skillName &&
        entry.skillPath != null &&
        entry.skillPath === skillPath,
    ) ??
    entries.find((entry) => entry.skillName === skillName) ??
    null
  );
}

export interface SkillCreatorShareCodeItem {
  eventId: string;
  skillName: string;
  skillPath: string;
  skillTitle: string | null;
  /** Present only after the user mints (or a prior mint was cached locally). */
  entry: SkillShareCodeEntry | null;
}

/**
 * Detect when skill-creator scaffolds a skill in this conversation, and
 * expose a manual mint action. Codes are NOT auto-minted — the user must
 * click 「生成技能码」 on the banner.
 */
export const useSkillCreatorShareCodes = (
  conversationId: string | null | undefined,
) => {
  const events = useEventStore((s) => s.events);
  const loadedConversationId = useEventStore((s) => s.loadedConversationId);
  const dismissedEventIds = useSkillShareCodeBannerStore(
    (s) => s.dismissedEventIds,
  );
  const dismiss = useSkillShareCodeBannerStore((s) => s.dismiss);
  const [entriesByEventId, setEntriesByEventId] = useState<
    Record<string, SkillShareCodeEntry>
  >({});
  const [mintingEventId, setMintingEventId] = useState<string | null>(null);
  const mintInFlightRef = useRef<Set<string>>(new Set());

  const allowAnySkillMd = isSkillSharePendingConversation(conversationId);

  const items = useMemo<SkillCreatorShareCodeItem[]>(() => {
    if (!conversationId || conversationId !== loadedConversationId) return [];
    return detectSkillCreatorInits(events, { allowAnySkillMd })
      .filter((init) => !dismissedEventIds[init.eventId])
      .map((init) => {
        const skillTitle = skillTitleFromEvents(events, init.eventId);
        const entry =
          entriesByEventId[init.eventId] ??
          cachedEntryForSkill(init.skillName, init.skillPath);
        return {
          eventId: init.eventId,
          skillName: init.skillName,
          skillPath: init.skillPath,
          skillTitle,
          entry,
        };
      });
  }, [
    conversationId,
    loadedConversationId,
    events,
    dismissedEventIds,
    allowAnySkillMd,
    entriesByEventId,
  ]);

  const mintCode = useCallback(
    async (eventId: string) => {
      const item = items.find((candidate) => candidate.eventId === eventId);
      if (!item) return;

      if (item.entry) {
        setEntriesByEventId((current) =>
          current[eventId] ? current : { ...current, [eventId]: item.entry! },
        );
        displaySuccessToast(
          `技能「${item.skillName}」技能码：${item.entry.code}`,
        );
        return;
      }

      if (mintInFlightRef.current.has(eventId)) return;
      mintInFlightRef.current.add(eventId);
      setMintingEventId(eventId);

      try {
        const entry = await mintSkillShareCode({
          skillName: item.skillName,
          skillPath: item.skillPath,
          skillTitle: item.skillTitle,
        });
        setEntriesByEventId((current) =>
          current[eventId] ? current : { ...current, [eventId]: entry },
        );
        displaySuccessToast(
          `技能「${item.skillName}」已创建，技能码：${entry.code}`,
        );
      } catch (error: unknown) {
        displayErrorToast(skillShareUserErrorMessage(error, "mint"));
      } finally {
        mintInFlightRef.current.delete(eventId);
        setMintingEventId((current) => (current === eventId ? null : current));
      }
    },
    [items],
  );

  const dismissAll = useCallback(
    () => dismiss(items.map((item) => item.eventId)),
    [dismiss, items],
  );

  return { items, mintCode, mintingEventId, dismissAll };
};
