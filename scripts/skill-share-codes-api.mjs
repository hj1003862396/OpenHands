/**
 * Canvas-owned skill share code API.
 *
 * Mounted in ingress, static-server, and the Vite dev server — before
 * `/api` is proxied to the agent-server — so a 6-digit code minted on one
 * computer can be redeemed on another. MySQL is the source of truth.
 * Skill files stay on disk.
 *
 *   POST  /api/canvas/skill-share-codes
 *   GET   /api/canvas/skill-share-codes/:code
 *   PATCH /api/canvas/skill-share-codes/:code   { skillTitle }
 *
 * Auth reuses the deployment session key (`X-Session-API-Key`) when one is
 * configured. Knowing the code is enough to redeem it; there is no user login.
 */

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const SKILL_SHARE_CODES_API_PATH = "/api/canvas/skill-share-codes";

/**
 * Kept in sync with scripts/skill-share-codes-schema.sql (comments live
 * only in the file). Embedded here so Electron and Docker can migrate
 * without shipping the .sql file next to the script.
 */
export const SKILL_SHARE_CODES_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS skill_share_codes (
  code CHAR(6) NOT NULL,
  skill_name VARCHAR(255) NOT NULL,
  skill_path TEXT NULL,
  workspace_path TEXT NULL,
  skill_title VARCHAR(255) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at TIMESTAMP(3) NULL,
  skill_identity CHAR(64) NOT NULL,
  PRIMARY KEY (code),
  UNIQUE KEY uq_skill_share_identity (skill_identity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

const SESSION_API_KEY_HEADER = "x-session-api-key";
const SESSION_KEY_ENV_NAMES = [
  "SESSION_API_KEY",
  "OH_SESSION_API_KEYS_0",
  "LOCAL_BACKEND_API_KEY",
  "VITE_SESSION_API_KEY",
];
const MAX_BODY_BYTES = 65_536;
const MAX_SKILL_NAME_LENGTH = 255;
const MAX_SKILL_TITLE_LENGTH = 255;
const MAX_SKILL_PATH_LENGTH = 8192;
const CODE_ALLOCATION_ATTEMPTS = 8;

const USER_SKILL_DIR_MARKERS = [
  "/.agents/skills/",
  "/.openhands/skills/",
  "/.openhands/microagents/",
];

const SELECT_COLUMNS = `code, skill_name, skill_path, workspace_path, skill_title,
       CAST(ROUND(UNIX_TIMESTAMP(created_at) * 1000) AS SIGNED) AS created_at_ms`;

let poolPromise = null;
let migratePromise = null;

function httpError(status, errorCode, message) {
  const error = new Error(message);
  error.status = status;
  error.errorCode = errorCode;
  return error;
}

function normalizePath(path) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Same rule as `deriveWorkspacePathFromSkillPath` in
 * src/utils/skill-share-codes.ts. Personal home skills stay workspace-less.
 * @param {string | null | undefined} skillPath
 * @returns {string | null}
 */
export function deriveWorkspacePathFromSkillPath(skillPath) {
  if (!skillPath) return null;
  const norm = normalizePath(skillPath);
  for (const marker of USER_SKILL_DIR_MARKERS) {
    const idx = norm.indexOf(marker);
    if (idx === -1) continue;
    const prefix = norm.slice(0, idx);
    if (/^\/home\/[^/]+$/.test(prefix) || /^\/Users\/[^/]+$/.test(prefix)) {
      return null;
    }
    if (prefix) return prefix;
  }
  return null;
}

/** @returns {string} zero-padded 6-digit code */
export function generateSixDigitCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function skillShareIdentity(skillName, skillPath) {
  return createHash("sha256")
    .update(`${skillName}\n${skillPath ?? ""}`, "utf8")
    .digest("hex");
}

function normalizeSkillPath(value) {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw httpError(400, "invalid_body", "skillPath must be a string or null");
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = normalizePath(trimmed);
  if (normalized.length > MAX_SKILL_PATH_LENGTH) {
    throw httpError(400, "invalid_body", "skillPath is too long");
  }
  return normalized;
}

function normalizeTitle(value) {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw httpError(400, "invalid_body", "skillTitle must be a string or null");
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_SKILL_TITLE_LENGTH) {
    throw httpError(400, "invalid_body", "skillTitle is too long");
  }
  return trimmed;
}

function publicEntry(entry) {
  return {
    code: entry.code,
    skillName: entry.skillName,
    skillPath: entry.skillPath ?? null,
    workspacePath: entry.workspacePath ?? null,
    skillTitle: entry.skillTitle ?? null,
    createdAt: entry.createdAt,
  };
}

function isIdentityConflict(error) {
  if (error?.constraint === "identity") return true;
  return (
    error?.code === "ER_DUP_ENTRY" &&
    String(error.message ?? "").includes("uq_skill_share_identity")
  );
}

function isCodeConflict(error) {
  if (error?.constraint === "primary") return true;
  return error?.code === "ER_DUP_ENTRY" && !isIdentityConflict(error);
}

function duplicateError(constraint) {
  const error = new Error(
    constraint === "identity"
      ? "Duplicate entry for key 'uq_skill_share_identity'"
      : "Duplicate entry for key 'PRIMARY'",
  );
  error.code = "ER_DUP_ENTRY";
  error.constraint = constraint;
  return error;
}

/**
 * @param {ReturnType<typeof createMemorySkillShareStore>} store
 * @param {{ skillName?: unknown, skillPath?: unknown, skillTitle?: unknown }} input
 */
export async function mintSkillShareCodeOnStore(store, input) {
  const skillName = typeof input?.skillName === "string" ? input.skillName.trim() : "";
  if (!skillName) {
    throw httpError(400, "invalid_body", "skillName is required");
  }
  if (skillName.length > MAX_SKILL_NAME_LENGTH) {
    throw httpError(400, "invalid_body", "skillName is too long");
  }
  const skillPath = normalizeSkillPath(input.skillPath);
  const skillTitle = normalizeTitle(input.skillTitle);
  const workspacePath = deriveWorkspacePathFromSkillPath(skillPath);
  const identity = skillShareIdentity(skillName, skillPath);

  const prior = await store.findActiveByIdentity(identity);
  if (prior) {
    if (skillTitle && prior.skillTitle !== skillTitle) {
      return (await store.updateTitle(prior.code, skillTitle)) ?? prior;
    }
    return prior;
  }

  for (let attempt = 0; attempt < CODE_ALLOCATION_ATTEMPTS; attempt += 1) {
    const code = generateSixDigitCode();
    try {
      return await store.insert({
        code,
        skillName,
        skillPath,
        workspacePath,
        skillTitle,
        createdAt: Date.now(),
        skillIdentity: identity,
      });
    } catch (error) {
      if (isIdentityConflict(error)) {
        const winner = await store.findActiveByIdentity(identity);
        if (winner) {
          if (skillTitle && winner.skillTitle !== skillTitle) {
            return (await store.updateTitle(winner.code, skillTitle)) ?? winner;
          }
          return winner;
        }
      }
      if (isCodeConflict(error)) continue;
      throw error;
    }
  }

  throw httpError(
    500,
    "internal",
    "Unable to allocate a unique skill share code",
  );
}

export function createMemorySkillShareStore() {
  /** @type {Map<string, { code: string, skillName: string, skillPath: string | null, workspacePath: string | null, skillTitle: string | null, createdAt: number, skillIdentity: string, revokedAt: number | null }>} */
  const byCode = new Map();

  function visible(entry) {
    if (!entry || entry.revokedAt) return null;
    return publicEntry(entry);
  }

  return {
    async migrate() {},
    async findActiveByCode(code) {
      return visible(byCode.get(code));
    },
    async findActiveByIdentity(identity) {
      for (const entry of byCode.values()) {
        if (entry.skillIdentity === identity) return visible(entry);
      }
      return null;
    },
    async insert(entry) {
      if (byCode.has(entry.code)) throw duplicateError("primary");
      for (const existing of byCode.values()) {
        if (existing.skillIdentity === entry.skillIdentity) {
          throw duplicateError("identity");
        }
      }
      byCode.set(entry.code, { ...entry, revokedAt: null });
      return publicEntry(entry);
    },
    async updateTitle(code, skillTitle) {
      const existing = byCode.get(code);
      if (!existing || existing.revokedAt) return null;
      existing.skillTitle = skillTitle;
      return publicEntry(existing);
    },
  };
}

function rowToEntry(row) {
  if (!row) return null;
  return {
    code: String(row.code).trim(),
    skillName: row.skill_name,
    skillPath: row.skill_path ?? null,
    workspacePath: row.workspace_path ?? null,
    skillTitle: row.skill_title ?? null,
    createdAt: Number(row.created_at_ms),
  };
}

/**
 * @param {(sql: string, params: unknown[]) => Promise<any>} query
 */
export function createMysqlSkillShareStore(query) {
  return {
    async migrate() {
      await query(SKILL_SHARE_CODES_SCHEMA_SQL, []);
    },
    async findActiveByCode(code) {
      const rows = await query(
        `SELECT ${SELECT_COLUMNS} FROM skill_share_codes WHERE code = ? AND revoked_at IS NULL LIMIT 1`,
        [code],
      );
      return rowToEntry(rows?.[0]);
    },
    async findActiveByIdentity(identity) {
      const rows = await query(
        `SELECT ${SELECT_COLUMNS} FROM skill_share_codes WHERE skill_identity = ? AND revoked_at IS NULL LIMIT 1`,
        [identity],
      );
      return rowToEntry(rows?.[0]);
    },
    async insert(entry) {
      await query(
        `INSERT INTO skill_share_codes
           (code, skill_name, skill_path, workspace_path, skill_title, created_at, skill_identity)
         VALUES (?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000), ?)`,
        [
          entry.code,
          entry.skillName,
          entry.skillPath,
          entry.workspacePath,
          entry.skillTitle,
          entry.createdAt,
          entry.skillIdentity,
        ],
      );
      return publicEntry(entry);
    },
    async updateTitle(code, skillTitle) {
      await query(
        `UPDATE skill_share_codes SET skill_title = ? WHERE code = ? AND revoked_at IS NULL`,
        [skillTitle, code],
      );
      return this.findActiveByCode(code);
    },
  };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ mode: "unset" } | { mode: "invalid", missing: string[] } | { mode: "url", url: string } | { mode: "fields", host: string, port: number, user: string, password: string, database: string }}
 */
export function readMysqlConfig(env) {
  const url = env.MYSQL_URL?.trim();
  if (url) return { mode: "url", url };

  const host = env.MYSQL_HOST?.trim() ?? "";
  const user = env.MYSQL_USER?.trim() ?? "";
  const database = env.MYSQL_DATABASE?.trim() ?? "";
  const portRaw = env.MYSQL_PORT?.trim() ?? "";
  const hasAny =
    Boolean(host || user || database || portRaw) ||
    (env.MYSQL_PASSWORD != null && env.MYSQL_PASSWORD !== "");
  if (!hasAny) return { mode: "unset" };

  const missing = [];
  if (!host) missing.push("MYSQL_HOST");
  if (!user) missing.push("MYSQL_USER");
  if (!database) missing.push("MYSQL_DATABASE");
  if (missing.length > 0) return { mode: "invalid", missing };

  const port = portRaw ? Number(portRaw) : 3306;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return { mode: "invalid", missing: ["MYSQL_PORT"] };
  }

  return {
    mode: "fields",
    host,
    port,
    user,
    password: env.MYSQL_PASSWORD ?? "",
    database,
  };
}

export function __resetSkillShareCodesApiForTests() {
  poolPromise = null;
  migratePromise = null;
}

async function openMysqlPool(config) {
  const mysql = await import("mysql2/promise");
  if (config.mode === "url") {
    return mysql.createPool(config.url);
  }
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 4,
    charset: "utf8mb4",
    timezone: "Z",
  });
}

async function loadMysqlStore() {
  const config = readMysqlConfig(process.env);
  if (config.mode === "unset") return { store: null, problem: "unset" };
  if (config.mode === "invalid") {
    return { store: null, problem: "invalid", missing: config.missing };
  }

  if (!poolPromise) {
    poolPromise = openMysqlPool(config).catch((error) => {
      poolPromise = null;
      throw error;
    });
  }
  const pool = await poolPromise;
  const store = createMysqlSkillShareStore(async (sql, params) => {
    const [rows] = await pool.query(sql, params);
    return rows;
  });
  if (!migratePromise) {
    migratePromise = store.migrate().catch((error) => {
      migratePromise = null;
      throw error;
    });
  }
  await migratePromise;
  return { store, problem: null };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string | null | undefined} explicit
 * @returns {string[]}
 */
export function resolveConfiguredSessionApiKeys(env, explicit) {
  const keys = [];
  if (typeof explicit === "string" && explicit.trim()) keys.push(explicit.trim());
  for (const name of SESSION_KEY_ENV_NAMES) {
    const value = env[name];
    if (typeof value === "string" && value.trim()) keys.push(value.trim());
  }
  return [...new Set(keys)];
}

function secretEquals(left, right) {
  const a = createHash("sha256").update(left, "utf8").digest();
  const b = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(a, b);
}

function headerValue(req, name) {
  const raw = req.headers?.[name];
  if (Array.isArray(raw)) return raw[0] ?? "";
  return typeof raw === "string" ? raw : "";
}

function assertAuthorized(req, options) {
  const keys =
    options.sessionApiKeys ??
    resolveConfiguredSessionApiKeys(process.env, options.sessionApiKey);
  if (keys.length === 0) return;
  const presented = headerValue(req, SESSION_API_KEY_HEADER).trim();
  if (presented && keys.some((key) => secretEquals(presented, key))) return;
  throw httpError(401, "unauthorized", "Session API key was rejected");
}

function sendJson(res, status, body) {
  if (res.headersSent) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(httpError(413, "invalid_body", "Request body is too large"));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(httpError(400, "invalid_body", "JSON object body is required"));
          return;
        }
        resolve(parsed);
      } catch {
        reject(httpError(400, "invalid_body", "Request body is not JSON"));
      }
    });
    req.on("error", (error) => {
      if (error?.status) reject(error);
      else reject(httpError(400, "invalid_body", "Failed to read request body"));
    });
  });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {{ kind: "collection" } | { kind: "item", code: string } | null}
 */
export function matchSkillShareCodesRequest(req) {
  let pathname = "/";
  try {
    pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    return null;
  }
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.replace(/\/+$/, "");
  }
  if (pathname === SKILL_SHARE_CODES_API_PATH) return { kind: "collection" };
  const prefix = `${SKILL_SHARE_CODES_API_PATH}/`;
  if (!pathname.startsWith(prefix)) return null;
  const code = pathname.slice(prefix.length);
  if (!code || code.includes("/")) return null;
  return { kind: "item", code };
}

function mysqlUnconfiguredBody(loaded) {
  if (loaded.problem === "invalid") {
    return {
      error: "mysql_unconfigured",
      message: `Skill share codes MySQL config is incomplete. Missing: ${loaded.missing.join(", ")}.`,
    };
  }
  return {
    error: "mysql_unconfigured",
    message:
      "Skill share codes require MySQL. Set MYSQL_URL or MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE. Redeem does not fall back to browser localStorage.",
  };
}

async function resolveStore(options) {
  if (options.loadStore) return options.loadStore();
  try {
    return await loadMysqlStore();
  } catch (error) {
    console.error(
      "Skill share codes MySQL error:",
      error instanceof Error ? error.message : error,
    );
    throw httpError(
      503,
      "mysql_unavailable",
      "Skill share codes MySQL is unavailable",
    );
  }
}

async function withStore(options, fn) {
  const loaded = await resolveStore(options);
  if (!loaded.store) {
    throw Object.assign(httpError(503, "mysql_unconfigured", "MySQL is not configured"), {
      body: mysqlUnconfiguredBody(loaded),
    });
  }
  try {
    return await fn(loaded.store);
  } catch (error) {
    if (error?.status) throw error;
    console.error(
      "Skill share codes MySQL error:",
      error instanceof Error ? error.message : error,
    );
    throw httpError(
      503,
      "mysql_unavailable",
      "Skill share codes MySQL is unavailable",
    );
  }
}

async function handleMatched(req, res, match, options) {
  assertAuthorized(req, options);
  const method = (req.method ?? "GET").toUpperCase();

  if (match.kind === "collection") {
    if (method !== "POST") {
      res.setHeader("Allow", "POST");
      throw httpError(405, "method_not_allowed", "Use POST to mint a skill share code");
    }
    const body = await readJsonBody(req);
    const entry = await withStore(options, (store) =>
      mintSkillShareCodeOnStore(store, body),
    );
    sendJson(res, 200, entry);
    return;
  }

  if (method === "GET" || method === "HEAD") {
    if (!/^\d{6}$/.test(match.code)) {
      throw httpError(400, "invalid_code", "Skill share codes are 6 digits");
    }
    const entry = await withStore(options, (store) =>
      store.findActiveByCode(match.code),
    );
    if (!entry) {
      throw httpError(404, "not_found", "Unknown skill share code");
    }
    sendJson(res, 200, entry);
    return;
  }

  if (method === "PATCH") {
    if (!/^\d{6}$/.test(match.code)) {
      throw httpError(400, "invalid_code", "Skill share codes are 6 digits");
    }
    const body = await readJsonBody(req);
    const skillTitle = normalizeTitle(body.skillTitle);
    if (!skillTitle) {
      throw httpError(400, "invalid_body", "skillTitle is required");
    }
    const entry = await withStore(options, (store) =>
      store.updateTitle(match.code, skillTitle),
    );
    if (!entry) {
      throw httpError(404, "not_found", "Unknown skill share code");
    }
    sendJson(res, 200, entry);
    return;
  }

  res.setHeader("Allow", "GET, HEAD, PATCH");
  throw httpError(405, "method_not_allowed", "Method is not supported");
}

/**
 * Handle a skill-share request. Returns false when the URL is not this API
 * so the caller can keep proxying. Never reads the body unless the path matches.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ sessionApiKey?: string | null, sessionApiKeys?: string[], loadStore?: () => Promise<{ store: any, problem: string | null, missing?: string[] }> }} [options]
 * @returns {Promise<boolean>}
 */
export async function tryHandleSkillShareCodesRequest(req, res, options = {}) {
  const match = matchSkillShareCodesRequest(req);
  if (!match) return false;
  try {
    await handleMatched(req, res, match, options);
  } catch (error) {
    const status = error?.status ?? 500;
    if (
      status >= 500 &&
      error?.errorCode !== "mysql_unavailable" &&
      error?.errorCode !== "mysql_unconfigured"
    ) {
      console.error("Skill share codes API error:", error);
    }
    const body = error?.body ?? {
      error: error?.errorCode ?? "internal",
      message:
        status === 500
          ? "Skill share codes API failed"
          : (error?.message ?? "Skill share codes API failed"),
    };
    sendJson(res, status, body);
  }
  return true;
}
