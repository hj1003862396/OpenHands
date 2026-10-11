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
  /**
   * Short title for share copy: the first `#` heading in SKILL.md
   * (for example `100 字短文体写作`). Absent on older saved codes.
   */
  skillTitle?: string | null;
}

/** How long the saved-code Share control shows「已复制」after a successful copy. */
export const SKILL_SHARE_COPIED_FEEDBACK_MS = 1500;

const SKILL_MARKDOWN_FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export interface SkillShareTitleChoice {
  title: string;
  /** True when `title` came from a SKILL.md `#` heading, not a fallback. */
  fromMarkdown: boolean;
}

/**
 * First ATX H1 in a SKILL.md body. YAML `description` and `##` sections
 * are ignored. Returns null when the file has no `# …` heading.
 */
export function extractSkillShortTitle(
  markdown: string | null | undefined,
): string | null {
  if (!markdown) return null;
  const body = markdown.replace(SKILL_MARKDOWN_FRONTMATTER, "");
  let inFence = false;
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = trimmed.match(/^#\s+(.+)$/);
    if (!match) continue;
    const title = match[1]!.replace(/\s+#+\s*$/, "").trim();
    if (title) return title;
  }
  return null;
}

/**
 * Pick the share-card short title.
 * Live `#` headings win; otherwise stored title, then the skills-API
 * display name, then the English slash-command name.
 */
export function chooseSkillShareTitle(input: {
  skillName: string;
  storedTitle?: string | null;
  markdown?: Array<string | null | undefined>;
  apiDisplay?: string | null;
}): SkillShareTitleChoice {
  for (const source of input.markdown ?? []) {
    const extracted = extractSkillShortTitle(source);
    if (extracted) return { title: extracted, fromMarkdown: true };
  }
  const stored = input.storedTitle?.trim();
  if (stored) return { title: stored, fromMarkdown: false };
  const apiDisplay = input.apiDisplay?.trim();
  if (apiDisplay) return { title: apiDisplay, fromMarkdown: false };
  return { title: input.skillName, fromMarkdown: false };
}

/** Clipboard blurb shared from a saved skill-code row. */
export function formatSkillShareClipboardText(
  code: string,
  title: string,
): string {
  return `SkillsDog 技能码：${code}（${title}） — https://skillsdog.com`;
}

/** Absolute SKILL.md path for a stored skill directory (or file path). */
export function skillMarkdownPath(skillPath: string): string {
  const normalized = skillPath.replace(/\\/g, "/").replace(/\/+$/, "");
  if (/\/SKILL\.md$/i.test(normalized)) return normalized;
  return `${normalized}/SKILL.md`;
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

function normalizeOptionalTitle(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Persist a resolved short title onto an existing code. No-op when the
 * code is missing or the title is unchanged.
 */
export function rememberSkillShareTitle(
  code: string,
  skillTitle: string,
): void {
  const title = normalizeOptionalTitle(skillTitle);
  const trimmedCode = code.trim();
  if (!title || !isValidSkillShareCode(trimmedCode)) return;
  const entries = readSkillShareCodes();
  const entry = entries[trimmedCode];
  if (!entry || entry.skillTitle === title) return;
  writeSkillShareCodes({
    ...entries,
    [trimmedCode]: { ...entry, skillTitle: title },
  });
}

/**
 * Mint (or return existing) a share code for a skill. Idempotent per
 * skillName+skillPath: re-minting the same skill returns the prior code.
 * A later mint can fill in `skillTitle` when the first write didn't have one.
 */
export function mintSkillShareCode(input: {
  skillName: string;
  skillPath?: string | null;
  skillTitle?: string | null;
}): SkillShareCodeEntry {
  const skillName = input.skillName.trim();
  if (!skillName) {
    throw new Error("skillName is required");
  }
  const skillPath = input.skillPath ? normalizePath(input.skillPath) : null;
  const workspacePath = deriveWorkspacePathFromSkillPath(skillPath);
  const skillTitle = normalizeOptionalTitle(input.skillTitle);

  const existing = readSkillShareCodes();
  const prior = Object.values(existing).find(
    (entry) =>
      entry.skillName === skillName && (entry.skillPath ?? null) === skillPath,
  );
  if (prior) {
    if (skillTitle && prior.skillTitle !== skillTitle) {
      const updated: SkillShareCodeEntry = { ...prior, skillTitle };
      writeSkillShareCodes({ ...existing, [prior.code]: updated });
      return updated;
    }
    return prior;
  }

  const code = generateSixDigitCode(new Set(Object.keys(existing)));
  const entry: SkillShareCodeEntry = {
    code,
    skillName,
    skillPath,
    workspacePath,
    createdAt: Date.now(),
    ...(skillTitle ? { skillTitle } : {}),
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
