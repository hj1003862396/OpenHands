import { OpenHandsEvent } from "#/types/agent-server/core";
import {
  isExecuteBashObservationEvent,
  isObservationEvent,
} from "#/types/agent-server/type-guards";

export interface DetectedSkillCreatorInit {
  /** Id of the observation/action event that triggered detection. */
  eventId: string;
  skillName: string;
  /** Absolute (or normalized) path to the skill directory. */
  skillPath: string;
}

/** sessionStorage key: conversation ids launched via 「创建技能码」. */
export const SKILL_SHARE_PENDING_CONVOS_KEY =
  "openhands-skill-share-pending-convos";

export function markSkillSharePendingConversation(
  conversationId: string,
): void {
  if (typeof window === "undefined" || !conversationId) return;
  try {
    const raw = window.sessionStorage.getItem(SKILL_SHARE_PENDING_CONVOS_KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!list.includes(conversationId)) {
      list.push(conversationId);
      window.sessionStorage.setItem(
        SKILL_SHARE_PENDING_CONVOS_KEY,
        JSON.stringify(list),
      );
    }
  } catch {
    // sessionStorage unavailable
  }
}

export function isSkillSharePendingConversation(
  conversationId: string | null | undefined,
): boolean {
  if (typeof window === "undefined" || !conversationId) return false;
  try {
    const raw = window.sessionStorage.getItem(SKILL_SHARE_PENDING_CONVOS_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw) as string[];
    return Array.isArray(list) && list.includes(conversationId);
  } catch {
    return false;
  }
}

/**
 * init_skill.py success lines (optional path — agents often skip the script
 * and write SKILL.md directly via FileEditor / touch).
 */
const INIT_SUCCESS_PATTERNS: RegExp[] = [
  /^✅ Skill '([^']+)' initialized successfully at (.+)$/m,
  /^✅ Created skill directory:\s*(.+)$/m,
];

/** Known on-disk skill roots → skill dir is `<root>/<name>`. */
const SKILL_ROOT_MARKERS = [
  "/.agents/skills/",
  "/.openhands/skills/",
  "/.openhands/microagents/",
] as const;

const FILE_EDIT_KINDS = new Set([
  "FileEditorObservation",
  "StrReplaceEditorObservation",
]);

const READ_ONLY_FILE_COMMANDS = new Set(["view"]);

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function textFromBashObservation(event: OpenHandsEvent): string {
  if (!isExecuteBashObservationEvent(event)) return "";
  const content = event.observation.content ?? [];
  const body = content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  const command =
    typeof event.observation.command === "string"
      ? event.observation.command
      : "";
  return `${command}\n${body}`;
}

/**
 * Parse `.../<skillRoot>/<name>/SKILL.md` or `.../<skillRoot>/<name>` into
 * { skillName, skillPath }.
 */
export function parseSkillCoordsFromPath(
  rawPath: string,
): { skillName: string; skillPath: string } | null {
  const path = normalizePath(rawPath);
  if (!path) return null;

  // Strip trailing SKILL.md
  const withoutSkillMd = path.replace(/\/SKILL\.md$/i, "");

  for (const marker of SKILL_ROOT_MARKERS) {
    const idx = withoutSkillMd.indexOf(marker);
    if (idx === -1) continue;
    const after = withoutSkillMd.slice(idx + marker.length);
    const skillName = after.split("/").filter(Boolean)[0];
    if (!skillName) continue;
    const skillPath = withoutSkillMd.slice(
      0,
      idx + marker.length + skillName.length,
    );
    return { skillName, skillPath };
  }

  // Generic: …/skills/<name>/SKILL.md (init_skill --path …/skills)
  const generic = withoutSkillMd.match(/^(.*\/skills\/([^/]+))$/i);
  if (generic && /\/SKILL\.md$/i.test(path)) {
    return { skillName: generic[2], skillPath: generic[1] };
  }

  // Pending create-skill-code conversations: any */SKILL.md create
  if (/\/SKILL\.md$/i.test(path)) {
    const parts = withoutSkillMd.split("/").filter(Boolean);
    const skillName = parts[parts.length - 1];
    if (skillName && skillName !== "skills" && skillName !== "microagents") {
      return { skillName, skillPath: withoutSkillMd };
    }
  }

  return null;
}

function detectFromBashText(
  eventId: string,
  text: string,
): DetectedSkillCreatorInit | null {
  for (const pattern of INIT_SUCCESS_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    if (pattern.source.includes("Created skill directory")) {
      const skillPath = normalizePath(match[1]);
      const skillName = skillPath.split("/").filter(Boolean).pop();
      if (!skillName) continue;
      return { eventId, skillName, skillPath };
    }

    const skillName = match[1];
    const skillPath = normalizePath(match[2]);
    if (!skillName || !skillPath) continue;
    return { eventId, skillName, skillPath };
  }

  // init_skill.py <name> --path <dir> in the command line
  const initCmd = text.match(
    /init_skill\.py\s+([a-z0-9][a-z0-9-]{0,39})\s+--path\s+(\S+)/i,
  );
  if (initCmd) {
    const skillName = initCmd[1];
    const base = normalizePath(initCmd[2]);
    return {
      eventId,
      skillName,
      skillPath: `${base}/${skillName}`,
    };
  }

  // Bash wrote/touched a SKILL.md under a known skills root
  const skillMdPath = text.match(
    /(\/(?:[\w.-]+\/)*(?:\.agents\/skills|\.openhands\/skills|\.openhands\/microagents)\/[a-z0-9][a-z0-9-]{0,39}\/SKILL\.md)/i,
  );
  if (skillMdPath) {
    const coords = parseSkillCoordsFromPath(skillMdPath[1]);
    if (coords) return { eventId, ...coords };
  }

  return null;
}

function detectFromFileEditor(
  event: OpenHandsEvent,
  allowAnySkillMd: boolean,
): DetectedSkillCreatorInit | null {
  if (!isObservationEvent(event)) return null;
  const obs = event.observation as {
    kind?: string;
    command?: string;
    path?: string | null;
    error?: string | null;
  };
  if (!obs.kind || !FILE_EDIT_KINDS.has(obs.kind)) return null;
  if (obs.command && READ_ONLY_FILE_COMMANDS.has(obs.command)) return null;
  if (obs.error) return null;
  if (!obs.path) return null;

  const path = normalizePath(obs.path);
  if (!/\/SKILL\.md$/i.test(path)) return null;

  // Prefer known skill roots; fall back to any SKILL.md only for pending
  // create-skill-code conversations (agents often `touch skill-name/SKILL.md`
  // in the workspace without using .agents/skills).
  const underKnownRoot = SKILL_ROOT_MARKERS.some((m) => path.includes(m));
  const underGenericSkills = /\/skills\/[^/]+\/SKILL\.md$/i.test(path);
  if (!underKnownRoot && !underGenericSkills && !allowAnySkillMd) {
    return null;
  }

  const coords = parseSkillCoordsFromPath(path);
  if (!coords) return null;
  return { eventId: event.id, ...coords };
}

/**
 * Detect skills scaffolded in this conversation via skill-creator.
 *
 * skill-creator's primary path is writing SKILL.md (FileEditor / touch), not
 * necessarily running init_skill.py — so we match both bash success lines and
 * file-editor writes to skill SKILL.md paths.
 */
export function detectSkillCreatorInits(
  events: OpenHandsEvent[],
  options?: { allowAnySkillMd?: boolean },
): DetectedSkillCreatorInit[] {
  const allowAnySkillMd = options?.allowAnySkillMd ?? false;
  const byKey = new Map<string, DetectedSkillCreatorInit>();

  for (const event of events) {
    let detected: DetectedSkillCreatorInit | null = null;

    if (isExecuteBashObservationEvent(event)) {
      detected = detectFromBashText(event.id, textFromBashObservation(event));
    } else {
      detected = detectFromFileEditor(event, allowAnySkillMd);
    }

    if (!detected) continue;
    byKey.delete(detected.skillPath);
    byKey.set(detected.skillPath, detected);
  }

  return [...byKey.values()];
}
