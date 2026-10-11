/**
 * Prepare a fresh Agent Canvas workspace that contains only the skill(s)
 * needed for a skill-code create/redeem conversation.
 *
 * Redeem must not reopen the creator's workspace (which may hold other
 * skills, spreadsheets, or drafts). Create must not inherit sibling skills
 * from a shared directory either.
 *
 * Each isolated workspace also gets a PreToolUse path-isolation hook so the
 * agent cannot `ls`/`cat` sibling hex dirs under agent-canvas/workspaces or
 * global ~/.openhands/skills (LocalWorkspace has no Docker chroot).
 */

import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import { getAgentServerWorkingDir } from "#/api/agent-server-config";
import { resolveAbsoluteAgentServerPath } from "#/api/agent-server-home";

export interface IsolatedSkillSource {
  /** Slash-command / directory name under `.agents/skills/`. */
  skillName: string;
  /**
   * Absolute path to the skill directory (or its SKILL.md). When omitted,
   * common personal skill locations are probed for `skillName`.
   */
  skillPath?: string | null;
}

export interface PrepareIsolatedSkillWorkspaceResult {
  workspacePath: string;
  /** Skills that were successfully copied into `.agents/skills/`. */
  seededSkills: string[];
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function normalizeSkillDir(skillPath: string): string {
  return skillPath
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .replace(/\/SKILL\.md$/i, "");
}

function newWorkspaceHex(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

async function runBash(command: string): Promise<{
  exit_code: number;
  stdout: string;
  stderr: string;
}> {
  return AgentServerRuntimeService.executeCommand(
    null,
    null,
    command,
    undefined,
    60,
  );
}

/**
 * Resolve an absolute skill directory. Prefers an explicit `skillPath`, then
 * probes `$HOME/.openhands/skills/<name>` and `$HOME/.agents/skills/<name>`.
 */
export async function resolveSkillSourceDirectory(
  source: IsolatedSkillSource,
): Promise<string | null> {
  if (source.skillPath?.trim()) {
    return normalizeSkillDir(source.skillPath.trim());
  }

  const name = source.skillName.trim();
  if (
    !name ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("..")
  ) {
    return null;
  }

  const quotedName = shellQuote(name);
  const result = await runBash(
    [
      `name=${quotedName}`,
      `for d in "$HOME/.openhands/skills/$name" "$HOME/.agents/skills/$name"; do`,
      `  if [ -d "$d" ] && [ -f "$d/SKILL.md" ]; then printf '%s' "$d"; exit 0; fi`,
      `done`,
      `exit 1`,
    ].join("\n"),
  );
  if (result.exit_code !== 0) return null;
  const path = result.stdout.trim();
  return path || null;
}

/**
 * Install `.openhands/hooks.json` that runs the path-isolation PreToolUse
 * guard. Prefers the canonical host copy under
 * `$HOME/.openhands/agent-canvas/path-isolation-guard.py`.
 */
async function seedPathIsolationHooks(workspacePath: string): Promise<void> {
  const quotedWs = shellQuote(workspacePath);
  const result = await runBash(
    [
      `ws=${quotedWs}`,
      `mkdir -p "$ws/.openhands"`,
      `guard=""`,
      `for c in \\`,
      `  "$HOME/.openhands/agent-canvas/path-isolation-guard.py" \\`,
      `  "/workspace/OpenHands/scripts/path-isolation/path-isolation-guard.py"; do`,
      `  if [ -f "$c" ]; then guard="$c"; break; fi`,
      `done`,
      `if [ -z "$guard" ]; then`,
      `  echo "path-isolation guard script not found" >&2`,
      `  exit 1`,
      `fi`,
      `python3 - "$ws" "$guard" <<'PY'`,
      `import json, sys`,
      `from pathlib import Path`,
      `ws, guard = Path(sys.argv[1]), Path(sys.argv[2]).resolve()`,
      `hooks = {`,
      `  "PreToolUse": [{`,
      `    "matcher": "/^(terminal|file_editor|read_file|write_file|edit|list_directory|glob|grep|planning_file_editor)$/",`,
      `    "hooks": [{`,
      `      "type": "command",`,
      `      "name": "path-isolation-guard",`,
      `      "command": f"python3 {guard}",`,
      `      "timeout": 10,`,
      `    }],`,
      `  }],`,
      `}`,
      `(ws / ".openhands" / "hooks.json").write_text(json.dumps(hooks, indent=2) + "\\n")`,
      `print(str(ws / ".openhands" / "hooks.json"))`,
      `PY`,
    ].join("\n"),
  );
  if (result.exit_code !== 0) {
    throw new Error(
      result.stderr.trim() ||
        `Failed to seed path-isolation hooks into ${workspacePath}`,
    );
  }
}

/**
 * Create `<workspaces>/<hex>/` and copy each source skill into
 * `.agents/skills/<name>/` (contents only — no sibling skills, no creator
 * workspace files). Also seeds PreToolUse path-isolation hooks. Returns the
 * absolute workspace path.
 */
export async function prepareIsolatedSkillWorkspace(
  sources: IsolatedSkillSource[],
): Promise<PrepareIsolatedSkillWorkspaceResult> {
  const workspacesRoot = await resolveAbsoluteAgentServerPath(
    getAgentServerWorkingDir(),
  );
  const workspacePath = `${workspacesRoot.replace(/\/+$/, "")}/${newWorkspaceHex()}`;
  const skillsRoot = `${workspacePath}/.agents/skills`;

  const mkdir = await runBash(`mkdir -p ${shellQuote(skillsRoot)}`);
  if (mkdir.exit_code !== 0) {
    throw new Error(
      mkdir.stderr.trim() ||
        `Failed to create isolated workspace at ${workspacePath}`,
    );
  }

  const seededSkills: string[] = [];
  for (const source of sources) {
    const name = source.skillName.trim();
    if (!name) continue;
    const from = await resolveSkillSourceDirectory(source);
    if (!from) continue;

    const dest = `${skillsRoot}/${name}`;
    const copy = await runBash(
      `mkdir -p ${shellQuote(dest)} && cp -a ${shellQuote(`${from}/.`)} ${shellQuote(`${dest}/`)}`,
    );
    if (copy.exit_code !== 0) {
      throw new Error(
        copy.stderr.trim() ||
          `Failed to copy skill "${name}" into isolated workspace`,
      );
    }
    seededSkills.push(name);
  }

  await seedPathIsolationHooks(workspacePath);

  return { workspacePath, seededSkills };
}
