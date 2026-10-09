/**
 * Client-side 6-digit skill share codes.
 *
 * Maps a numeric code → skill coordinates so a home-page redeem can start a
 * conversation that invokes that skill. Persistence is localStorage only —
 * there is no server share API yet.
 */

export interface SkillShareCodeEntry {
  /** Six-digit numeric string, e.g. "482913". */
  code: string;
  /** Skill slash-command name (agentskills / SKILL.md `name`). */
  skillName: string;
  /**
   * Absolute path to the skill directory when known (from skill-creator
   * init output or a SkillInfo.source path). Used to derive workingDir.
   */
  skillPath: string | null;
  /**
   * Workspace root the skill lives under, when it is a project skill
   * (…/.agents/skills/<name>). Null for personal (~/.agents) or unknown.
   */
  workspacePath: string | null;
  createdAt: number;
}

export const SKILL_SHARE_CODES_STORAGE_KEY = "openhands-skill-share-codes";

const USER_SKILL_DIR_MARKERS = [
  "/.agents/skills/",
  "/.openhands/skills/",
  "/.openhands/microagents/",
] as const;

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Derive workspace root from a skill directory or SKILL.md path.
 * Returns null for personal (~/…) skills or unrecognized layouts.
 */
export function deriveWorkspacePathFromSkillPath(
  skillPath: string | null | undefined,
): string | null {
  if (!skillPath) return null;
  const norm = normalizePath(skillPath);
  for (const marker of USER_SKILL_DIR_MARKERS) {
    const idx = norm.indexOf(marker);
    if (idx === -1) continue;
    const prefix = norm.slice(0, idx);
    // Personal: /home/<user> or /Users/<user>
    if (/^\/home\/[^/]+$/.test(prefix) || /^\/Users\/[^/]+$/.test(prefix)) {
      return null;
    }
    if (prefix) return prefix;
  }
  return null;
}

/** Prefer crypto when available; fall back to Math.random. */
export function generateSixDigitCode(
  existing: ReadonlySet<string> = new Set(),
): string {
  const maxAttempts = 64;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let n: number;
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      n = buf[0] % 1_000_000;
    } else {
      n = Math.floor(Math.random() * 1_000_000);
    }
    const code = n.toString().padStart(6, "0");
    if (!existing.has(code)) return code;
  }
  throw new Error("Unable to allocate a unique skill share code");
}

export function isValidSkillShareCode(raw: string): boolean {
  return /^\d{6}$/.test(raw.trim());
}

export function readSkillShareCodes(): Record<string, SkillShareCodeEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SKILL_SHARE_CODES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SkillShareCodeEntry>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

export function writeSkillShareCodes(
  entries: Record<string, SkillShareCodeEntry>,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SKILL_SHARE_CODES_STORAGE_KEY,
      JSON.stringify(entries),
    );
  } catch {
    // localStorage unavailable / quota — ignore
  }
}

export function lookupSkillShareCode(code: string): SkillShareCodeEntry | null {
  const trimmed = code.trim();
  if (!isValidSkillShareCode(trimmed)) return null;
  return readSkillShareCodes()[trimmed] ?? null;
}

/**
 * Mint (or return existing) a share code for a skill. Idempotent per
 * skillName+skillPath: re-minting the same skill returns the prior code.
 */
export function mintSkillShareCode(input: {
  skillName: string;
  skillPath?: string | null;
}): SkillShareCodeEntry {
  const skillName = input.skillName.trim();
  if (!skillName) {
    throw new Error("skillName is required");
  }
  const skillPath = input.skillPath ? normalizePath(input.skillPath) : null;
  const workspacePath = deriveWorkspacePathFromSkillPath(skillPath);

  const existing = readSkillShareCodes();
  const prior = Object.values(existing).find(
    (entry) =>
      entry.skillName === skillName && (entry.skillPath ?? null) === skillPath,
  );
  if (prior) return prior;

  const code = generateSixDigitCode(new Set(Object.keys(existing)));
  const entry: SkillShareCodeEntry = {
    code,
    skillName,
    skillPath,
    workspacePath,
    createdAt: Date.now(),
  };
  writeSkillShareCodes({ ...existing, [code]: entry });
  return entry;
}

/** Find an existing code for a skill name (any path). */
export function findCodeForSkillName(
  skillName: string,
): SkillShareCodeEntry | null {
  const existing = readSkillShareCodes();
  return (
    Object.values(existing).find((entry) => entry.skillName === skillName) ??
    null
  );
}
