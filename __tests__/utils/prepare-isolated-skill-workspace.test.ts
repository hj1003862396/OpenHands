import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import { resolveAbsoluteAgentServerPath } from "#/api/agent-server-home";
import {
  prepareIsolatedSkillWorkspace,
  resolveSkillSourceDirectory,
} from "#/utils/prepare-isolated-skill-workspace";

vi.mock("#/api/runtime-service/agent-server-runtime-service", () => ({
  default: {
    executeCommand: vi.fn(),
  },
}));

vi.mock("#/api/agent-server-home", async () => {
  const actual = await vi.importActual<
    typeof import("#/api/agent-server-home")
  >("#/api/agent-server-home");
  return {
    ...actual,
    resolveAbsoluteAgentServerPath: vi.fn(async (p: string) =>
      p.startsWith("/") ? p : `/abs/${p}`,
    ),
  };
});

vi.mock("#/api/agent-server-config", () => ({
  getAgentServerWorkingDir: () => "/home/box/.openhands/agent-canvas/workspaces",
}));

describe("prepareIsolatedSkillWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAbsoluteAgentServerPath).mockImplementation(async (p) =>
      p.startsWith("/") ? p : `/abs/${p}`,
    );
  });

  it("resolves an explicit skillPath directory", async () => {
    await expect(
      resolveSkillSourceDirectory({
        skillName: "demo",
        skillPath: "/tmp/ws/.agents/skills/demo/SKILL.md",
      }),
    ).resolves.toBe("/tmp/ws/.agents/skills/demo");
  });

  it("creates a fresh workspace, copies only the named skill, and seeds path hooks", async () => {
    const exec = vi.mocked(AgentServerRuntimeService.executeCommand);
    exec.mockResolvedValue({ exit_code: 0, stdout: "", stderr: "" });

    const result = await prepareIsolatedSkillWorkspace([
      {
        skillName: "takeout-review-stats",
        skillPath:
          "/home/box/.openhands/agent-canvas/workspaces/old/.agents/skills/takeout-review-stats",
      },
    ]);

    expect(result.seededSkills).toEqual(["takeout-review-stats"]);
    expect(result.workspacePath).toMatch(
      /^\/home\/box\/\.openhands\/agent-canvas\/workspaces\/[a-f0-9]+$/,
    );
    expect(result.workspacePath).not.toContain("/old");

    const commands = exec.mock.calls.map((call) => call[2] as string);
    expect(commands[0]).toContain("mkdir -p");
    expect(commands[0]).toContain(".agents/skills");
    expect(commands.some((c) => c.includes("cp -a"))).toBe(true);
    expect(commands.some((c) => c.includes("takeout-review-stats"))).toBe(true);
    // Must not copy the whole creator workspace — only the skill folder.
    expect(commands.some((c) => c.includes("/old/.'"))).toBe(false);
    // Path-isolation PreToolUse hooks must be seeded into the new workspace.
    expect(
      commands.some(
        (c) =>
          c.includes("path-isolation-guard") && c.includes("hooks.json"),
      ),
    ).toBe(true);
  });
});
