/**
 * 6-digit skill share codes.
 *
 * MySQL (via the Canvas `/api/canvas/skill-share-codes` route) is the source
 * of truth for mint and redeem, so a code created on one computer works on
 * another. localStorage only caches codes this browser has already seen,
 * for the saved-code list and share copy. Redeem does not accept that cache
 * when the server does not know the code.
 */

import {
  SkillShareApiError,
  lookupSkillShareCodeOnServer,
  mintSkillShareCodeOnServer,
  updateSkillShareTitleOnServer,
} from "#/api/skill-share-codes-client";

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

/** Codes this browser has cached. Not sufficient to redeem. */
export function lookupCachedSkillShareCode(
  code: string,
): SkillShareCodeEntry | null {
  const trimmed = code.trim();
  if (!isValidSkillShareCode(trimmed)) return null;
  return readSkillShareCodes()[trimmed] ?? null;
}

export function cacheSkillShareCode(entry: SkillShareCodeEntry): void {
  const existing = readSkillShareCodes();
  writeSkillShareCodes({ ...existing, [entry.code]: entry });
}

/**
 * Redeem lookup. Always asks the server. A 404 is "unknown code" (null).
 * Any other failure is thrown so the UI does not pretend the local cache
 * is enough. A successful lookup is written into the local cache.
 */
export async function lookupSkillShareCode(
  code: string,
): Promise<SkillShareCodeEntry | null> {
  const trimmed = code.trim();
  if (!isValidSkillShareCode(trimmed)) return null;
  try {
    const entry = await lookupSkillShareCodeOnServer(trimmed);
    cacheSkillShareCode(entry);
    return entry;
  } catch (error) {
    if (error instanceof SkillShareApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export function skillShareUserErrorMessage(
  error: unknown,
  intent: "mint" | "redeem",
): string {
  if (error instanceof SkillShareApiError) {
    if (
      error.code === "mysql_unconfigured" ||
      error.code === "mysql_unavailable"
    ) {
      return intent === "mint"
        ? "技能码服务未配置 MySQL，无法创建技能码"
        : "技能码服务未配置 MySQL，无法兑换";
    }
    if (error.status === 404 || error.code === "not_found") {
      return "未找到该技能码，请确认后重试";
    }
    if (error.status === 401 || error.code === "unauthorized") {
      return "技能码服务拒绝了当前会话密钥";
    }
  }
  return intent === "mint"
    ? "无法连接技能码服务，技能码未生成"
    : "无法连接技能码服务，请稍后重试";
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
  void updateSkillShareTitleOnServer(trimmedCode, title)
    .then((updated) => {
      cacheSkillShareCode(updated);
    })
    .catch(() => {
      // The local title still drives this browser's share copy.
    });
}

/**
 * Mint (or return existing) a share code for a skill. Idempotent per
 * skillName+skillPath on the server: re-minting the same skill returns the
 * prior code. A later mint can fill in `skillTitle` when the first write
 * didn't have one. The returned code is cached locally for the saved list.
 */
export async function mintSkillShareCode(input: {
  skillName: string;
  skillPath?: string | null;
  skillTitle?: string | null;
}): Promise<SkillShareCodeEntry> {
  const entry = await mintSkillShareCodeOnServer(input);
  cacheSkillShareCode(entry);
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
