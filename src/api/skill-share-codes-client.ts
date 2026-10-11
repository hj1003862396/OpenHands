import { getAgentServerHeaders } from "#/api/agent-server-config";
import { getRegisteredBackends } from "#/api/backend-registry/active-store";
import { SKILL_SHARE_CODES_API_PATH } from "#/api/skill-share-codes-path";

export interface SkillShareCodeRecord {
  code: string;
  skillName: string;
  skillPath: string | null;
  workspacePath: string | null;
  skillTitle: string | null;
  createdAt: number;
}

export class SkillShareApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "SkillShareApiError";
    this.status = status;
    this.code = code;
  }
}

export interface SkillShareMintInput {
  skillName: string;
  skillPath?: string | null;
  skillTitle?: string | null;
}

function skillShareRequestHeaders(): Record<string, string> {
  const baked = getAgentServerHeaders();
  if (Object.keys(baked).length > 0) return baked;

  const local = getRegisteredBackends().find(
    (backend) => backend.kind === "local" && backend.apiKey.length > 0,
  );
  if (!local) return {};
  return { "X-Session-API-Key": local.apiKey };
}

function collectionUrl(): string {
  return SKILL_SHARE_CODES_API_PATH;
}

function itemUrl(code: string): string {
  return `${SKILL_SHARE_CODES_API_PATH}/${encodeURIComponent(code)}`;
}

async function errorFromResponse(
  response: Response,
): Promise<SkillShareApiError> {
  let code = "request_failed";
  let message = response.statusText || "Skill share request failed";
  try {
    const body = (await response.json()) as {
      error?: unknown;
      message?: unknown;
    };
    if (typeof body.error === "string" && body.error) code = body.error;
    if (typeof body.message === "string" && body.message)
      message = body.message;
  } catch {
    // Non-JSON error bodies still surface as a status error.
  }
  return new SkillShareApiError(response.status, code, message);
}

function normalizeEntry(value: unknown): SkillShareCodeRecord {
  if (!value || typeof value !== "object") {
    throw new SkillShareApiError(
      502,
      "invalid_response",
      "Skill share response was empty",
    );
  }
  const body = value as Record<string, unknown>;
  if (typeof body.code !== "string" || typeof body.skillName !== "string") {
    throw new SkillShareApiError(
      502,
      "invalid_response",
      "Skill share response was missing code or skillName",
    );
  }
  return {
    code: body.code,
    skillName: body.skillName,
    skillPath: typeof body.skillPath === "string" ? body.skillPath : null,
    workspacePath:
      typeof body.workspacePath === "string" ? body.workspacePath : null,
    skillTitle: typeof body.skillTitle === "string" ? body.skillTitle : null,
    createdAt: typeof body.createdAt === "number" ? body.createdAt : Date.now(),
  };
}

export async function mintSkillShareCodeOnServer(
  input: SkillShareMintInput,
): Promise<SkillShareCodeRecord> {
  const response = await fetch(collectionUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...skillShareRequestHeaders(),
    },
    body: JSON.stringify({
      skillName: input.skillName,
      skillPath: input.skillPath ?? null,
      skillTitle: input.skillTitle ?? null,
    }),
  });
  if (!response.ok) throw await errorFromResponse(response);
  return normalizeEntry(await response.json());
}

export async function lookupSkillShareCodeOnServer(
  code: string,
): Promise<SkillShareCodeRecord> {
  const response = await fetch(itemUrl(code), {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...skillShareRequestHeaders(),
    },
  });
  if (!response.ok) throw await errorFromResponse(response);
  return normalizeEntry(await response.json());
}

export async function updateSkillShareTitleOnServer(
  code: string,
  skillTitle: string,
): Promise<SkillShareCodeRecord> {
  const response = await fetch(itemUrl(code), {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...skillShareRequestHeaders(),
    },
    body: JSON.stringify({ skillTitle }),
  });
  if (!response.ok) throw await errorFromResponse(response);
  return normalizeEntry(await response.json());
}
