import { useCallback, useEffect, useMemo, useRef } from "react";
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
  type SkillShareCodeEntry,
} from "#/utils/skill-share-codes";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";

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

export interface SkillCreatorShareCodeItem {
  eventId: string;
  skillName: string;
  skillPath: string;
  entry: SkillShareCodeEntry;
}

/**
 * Auto-mint share codes when skill-creator finishes scaffolding a skill in
 * this conversation. Codes are persisted in localStorage via mintSkillShareCode.
 * Also toasts the code once so it is visible even if the banner is scrolled off.
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
  const toastedCodesRef = useRef<Set<string>>(new Set());

  const allowAnySkillMd = isSkillSharePendingConversation(conversationId);

  const items = useMemo<SkillCreatorShareCodeItem[]>(() => {
    if (!conversationId || conversationId !== loadedConversationId) return [];
    return detectSkillCreatorInits(events, { allowAnySkillMd })
      .filter((init) => !dismissedEventIds[init.eventId])
      .map((init) => ({
        eventId: init.eventId,
        skillName: init.skillName,
        skillPath: init.skillPath,
        entry: mintSkillShareCode({
          skillName: init.skillName,
          skillPath: init.skillPath,
          skillTitle: skillTitleFromEvents(events, init.eventId),
        }),
      }));
  }, [
    conversationId,
    loadedConversationId,
    events,
    dismissedEventIds,
    allowAnySkillMd,
  ]);

  useEffect(() => {
    for (const item of items) {
      if (toastedCodesRef.current.has(item.entry.code)) continue;
      toastedCodesRef.current.add(item.entry.code);
      displaySuccessToast(
        `技能「${item.skillName}」已创建，技能码：${item.entry.code}`,
      );
    }
  }, [items]);

  const dismissAll = useCallback(
    () => dismiss(items.map((item) => item.eventId)),
    [dismiss, items],
  );

  return { items, dismissAll };
};
