// @vitest-environment node
import { createServer, request, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startStaticServer } from "../../scripts/static-server.mjs";
import {
  SKILL_SHARE_CODES_SCHEMA_SQL,
  createMemorySkillShareStore,
  createMysqlSkillShareStore,
  mintSkillShareCodeOnStore,
  readMysqlConfig,
  tryHandleSkillShareCodesRequest,
} from "../../scripts/skill-share-codes-api.mjs";

const SCHEMA_PATH = path.join(
  process.cwd(),
  "scripts",
  "skill-share-codes-schema.sql",
);

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("server did not bind"));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

async function httpJson(
  url: string,
  init: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = init.body === undefined ? null : JSON.stringify(init.body);
    const req = request(
      url,
      {
        method: init.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
          ...init.headers,
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode ?? 0,
              body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe("skill share code store", () => {
  it("keeps the embedded schema in sync with the SQL file", () => {
    const fileSql = readFileSync(SCHEMA_PATH, "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim();
    expect(fileSql.replace(/\s+/g, " ")).toBe(
      SKILL_SHARE_CODES_SCHEMA_SQL.replace(/\s+/g, " "),
    );
  });

  it("mints one code per skill identity and fills a later title", async () => {
    const store = createMemorySkillShareStore();
    const first = await mintSkillShareCodeOnStore(store, {
      skillName: "my-skill",
      skillPath: "/tmp/ws/.agents/skills/my-skill",
    });
    expect(first.code).toMatch(/^\d{6}$/);
    expect(first.workspacePath).toBe("/tmp/ws");
    expect(first.skillTitle).toBeNull();

    const again = await mintSkillShareCodeOnStore(store, {
      skillName: "my-skill",
      skillPath: "/tmp/ws/.agents/skills/my-skill",
      skillTitle: "100 字短文体写作",
    });
    expect(again.code).toBe(first.code);
    expect(again.skillTitle).toBe("100 字短文体写作");

    const personal = await mintSkillShareCodeOnStore(store, {
      skillName: "my-skill",
      skillPath: "/home/alice/.agents/skills/my-skill",
    });
    expect(personal.code).not.toBe(first.code);
    expect(personal.workspacePath).toBeNull();
  });

  it("retries when the generated code collides and returns the race winner", async () => {
    const inner = createMemorySkillShareStore();
    let collisions = 0;
    const store = {
      ...inner,
      async insert(entry: Parameters<typeof inner.insert>[0]) {
        if (collisions < 2) {
          collisions += 1;
          const error = new Error("Duplicate entry for key 'PRIMARY'");
          Object.assign(error, { code: "ER_DUP_ENTRY", constraint: "primary" });
          throw error;
        }
        return inner.insert(entry);
      },
    };

    const minted = await mintSkillShareCodeOnStore(store, {
      skillName: "retry-skill",
      skillPath: "/tmp/ws/.agents/skills/retry-skill",
    });
    expect(minted.skillName).toBe("retry-skill");
    expect(collisions).toBe(2);

    let raced = false;
    const racing = {
      ...inner,
      async findActiveByIdentity(identity: string) {
        if (!raced) return null;
        return inner.findActiveByIdentity(identity);
      },
      async insert(entry: Parameters<typeof inner.insert>[0]) {
        if (!raced) {
          raced = true;
          await inner.insert(entry);
          const error = new Error(
            "Duplicate entry for key 'uq_skill_share_identity'",
          );
          Object.assign(error, {
            code: "ER_DUP_ENTRY",
            constraint: "identity",
          });
          throw error;
        }
        return inner.insert(entry);
      },
    };
    const winner = await mintSkillShareCodeOnStore(racing, {
      skillName: "retry-skill",
      skillPath: "/tmp/ws/.agents/skills/retry-skill",
    });
    expect(winner.code).toBe(minted.code);
  });

  it("builds MySQL statements for migrate, lookup, insert, and title update", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const store = createMysqlSkillShareStore(async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("WHERE code = ?") && sql.startsWith("SELECT")) {
        return [
          {
            code: "000123 ",
            skill_name: "demo",
            skill_path: null,
            workspace_path: null,
            skill_title: "标题",
            created_at_ms: 50,
          },
        ];
      }
      return [];
    });

    await store.migrate();
    expect(calls[0]?.sql).toContain(
      "CREATE TABLE IF NOT EXISTS skill_share_codes",
    );
    expect(calls[0]?.sql).toContain("uq_skill_share_identity");

    const found = await store.findActiveByCode("000123");
    expect(found).toMatchObject({ code: "000123", skillName: "demo" });
    expect(calls.at(-1)?.sql).toContain("revoked_at IS NULL");

    await store.insert({
      code: "000123",
      skillName: "demo",
      skillPath: null,
      workspacePath: null,
      skillTitle: null,
      createdAt: 50,
      skillIdentity: "abc",
    });
    expect(calls.at(-1)?.sql).toContain("INSERT INTO skill_share_codes");
    expect(calls.at(-1)?.sql).toContain("FROM_UNIXTIME(? / 1000)");

    await store.updateTitle("000123", "标题");
    expect(calls.some((call) => call.sql.includes("SET skill_title"))).toBe(
      true,
    );
  });
});

describe("skill share code HTTP API", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => close(server)));
  });

  async function startApi(options: {
    sessionApiKeys?: string[];
    loadStore?: () => Promise<{
      store: ReturnType<typeof createMemorySkillShareStore> | null;
      problem: string | null;
      missing?: string[];
    }>;
  }) {
    const store = createMemorySkillShareStore();
    const server = createServer((req, res) => {
      void tryHandleSkillShareCodesRequest(req, res, {
        sessionApiKeys: options.sessionApiKeys ?? [],
        loadStore:
          options.loadStore ?? (async () => ({ store, problem: null })),
      });
    });
    servers.push(server);
    return { origin: await listen(server), store };
  }

  it("mints, looks up, rejects unknown codes, and updates the title", async () => {
    const { origin } = await startApi({});
    const minted = await httpJson(`${origin}/api/canvas/skill-share-codes`, {
      method: "POST",
      body: {
        skillName: "my-skill",
        skillPath: "/tmp/ws/.agents/skills/my-skill",
      },
    });
    expect(minted.status).toBe(200);
    expect(minted.body.code).toMatch(/^\d{6}$/);
    expect(minted.body.workspacePath).toBe("/tmp/ws");

    const same = await httpJson(`${origin}/api/canvas/skill-share-codes`, {
      method: "POST",
      body: {
        skillName: "my-skill",
        skillPath: "/tmp/ws/.agents/skills/my-skill",
      },
    });
    expect(same.body.code).toBe(minted.body.code);

    const lookedUp = await httpJson(
      `${origin}/api/canvas/skill-share-codes/${minted.body.code}`,
    );
    expect(lookedUp.status).toBe(200);
    expect(lookedUp.body.skillName).toBe("my-skill");

    const missing = await httpJson(
      `${origin}/api/canvas/skill-share-codes/000000`,
    );
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("not_found");

    const invalid = await httpJson(
      `${origin}/api/canvas/skill-share-codes/abcdef`,
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe("invalid_code");

    const listed = await httpJson(`${origin}/api/canvas/skill-share-codes`);
    expect(listed.status).toBe(405);

    const patched = await httpJson(
      `${origin}/api/canvas/skill-share-codes/${minted.body.code}`,
      { method: "PATCH", body: { skillTitle: "短标题" } },
    );
    expect(patched.status).toBe(200);
    expect(patched.body.skillTitle).toBe("短标题");
  });

  it("requires the session key when one is configured", async () => {
    const { origin } = await startApi({ sessionApiKeys: ["secret-key"] });
    const denied = await httpJson(`${origin}/api/canvas/skill-share-codes`, {
      method: "POST",
      body: { skillName: "my-skill" },
    });
    expect(denied.status).toBe(401);
    expect(denied.body.error).toBe("unauthorized");

    const allowed = await httpJson(`${origin}/api/canvas/skill-share-codes`, {
      method: "POST",
      headers: { "X-Session-API-Key": "secret-key" },
      body: { skillName: "my-skill" },
    });
    expect(allowed.status).toBe(200);
  });

  it("fails closed when MySQL is not configured", async () => {
    const { origin } = await startApi({
      loadStore: async () => ({ store: null, problem: "unset" }),
    });
    const response = await httpJson(
      `${origin}/api/canvas/skill-share-codes/123456`,
    );
    expect(response.status).toBe(503);
    expect(response.body.error).toBe("mysql_unconfigured");
    expect(String(response.body.message)).toContain("localStorage");
  });

  it("reports incomplete MySQL field config", () => {
    expect(readMysqlConfig({}).mode).toBe("unset");
    expect(readMysqlConfig({ MYSQL_URL: "mysql://db" })).toMatchObject({
      mode: "url",
      url: "mysql://db",
    });
    expect(
      readMysqlConfig({ MYSQL_HOST: "db.internal", MYSQL_USER: "canvas" }),
    ).toMatchObject({
      mode: "invalid",
      missing: ["MYSQL_DATABASE"],
    });
  });
});

describe("static-server skill share interception", () => {
  const servers: Server[] = [];
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => close(server)));
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("answers /api/canvas/skill-share-codes without proxying to the agent-server", async () => {
    let proxied = 0;
    const backend = createServer((_req, res) => {
      proxied += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ proxied: true }));
    });
    servers.push(backend);
    const backendOrigin = await listen(backend);

    const dir = mkdtempSync(path.join(tmpdir(), "skill-share-static-"));
    dirs.push(dir);
    const frontend = await startStaticServer({
      port: 0,
      host: "127.0.0.1",
      dir,
      routes: { "/api": backendOrigin },
      sessionApiKey: "static-key",
    });
    servers.push(frontend);
    const address = frontend.address();
    if (!address || typeof address === "string") {
      throw new Error("static server did not bind");
    }
    const origin = `http://127.0.0.1:${address.port}`;

    const blocked = await httpJson(`${origin}/api/canvas/skill-share-codes`, {
      method: "POST",
      body: { skillName: "my-skill" },
    });
    expect(blocked.status).toBe(401);
    expect(blocked.body.error).toBe("unauthorized");
    expect(proxied).toBe(0);

    if (readMysqlConfig(process.env).mode === "unset") {
      const unconfigured = await httpJson(
        `${origin}/api/canvas/skill-share-codes`,
        {
          method: "POST",
          headers: { "X-Session-API-Key": "static-key" },
          body: { skillName: "my-skill" },
        },
      );
      expect(unconfigured.status).toBe(503);
      expect(unconfigured.body.error).toBe("mysql_unconfigured");
      expect(proxied).toBe(0);
    }
  });
});
