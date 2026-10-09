import { describe, expect, it } from "vitest";
import {
  detectSkillCreatorInits,
  parseSkillCoordsFromPath,
} from "#/utils/skill-creator-events";
import type {
  CmdOutputMetadata,
  ExecuteBashObservation,
  FileEditorObservation,
  ObservationEvent,
} from "#/types/agent-server/core";
import { createUserMessageEvent } from "test-utils";

const successLine = (skill: string, path: string) =>
  `🚀 Initializing skill: ${skill}\n✅ Skill '${skill}' initialized successfully at ${path}`;

const makeBashObservationEvent = (
  id: string,
  text: string,
  command = "python3 init_skill.py my-skill --path /tmp/ws/.agents/skills",
): ObservationEvent<ExecuteBashObservation> => ({
  id,
  timestamp: new Date().toISOString(),
  source: "environment",
  tool_name: "execute_bash",
  tool_call_id: `call-${id}`,
  action_id: `action-${id}`,
  observation: {
    kind: "ExecuteBashObservation",
    content: [{ type: "text", text }],
    command,
    exit_code: 0,
    error: false,
    timeout: false,
    metadata: {} as CmdOutputMetadata,
  },
});

const makeFileEditorEvent = (
  id: string,
  path: string,
  command: FileEditorObservation["command"] = "create",
): ObservationEvent<FileEditorObservation> => ({
  id,
  timestamp: new Date().toISOString(),
  source: "environment",
  tool_name: "file_editor",
  tool_call_id: `call-${id}`,
  action_id: `action-${id}`,
  observation: {
    kind: "FileEditorObservation",
    command,
    output: "OK",
    path,
    prev_exist: command !== "create",
    old_content: null,
    new_content: "---\nname: x\n---\n",
    error: null,
  },
});

describe("parseSkillCoordsFromPath", () => {
  it("parses .agents/skills SKILL.md paths", () => {
    expect(
      parseSkillCoordsFromPath("/tmp/ws/.agents/skills/my-skill/SKILL.md"),
    ).toEqual({
      skillName: "my-skill",
      skillPath: "/tmp/ws/.agents/skills/my-skill",
    });
  });

  it("parses a bare skill-dir/SKILL.md (pending create flow)", () => {
    expect(parseSkillCoordsFromPath("/workspace/demo-skill/SKILL.md")).toEqual({
      skillName: "demo-skill",
      skillPath: "/workspace/demo-skill",
    });
  });
});

describe("detectSkillCreatorInits", () => {
  it("detects skill-creator init success and extracts name + path", () => {
    const events = [
      createUserMessageEvent("evt-msg"),
      makeBashObservationEvent(
        "evt-init",
        successLine("my-skill", "/tmp/ws/.agents/skills/my-skill"),
      ),
    ];

    expect(detectSkillCreatorInits(events)).toEqual([
      {
        eventId: "evt-init",
        skillName: "my-skill",
        skillPath: "/tmp/ws/.agents/skills/my-skill",
      },
    ]);
  });

  it("detects Created skill directory bash line", () => {
    const events = [
      makeBashObservationEvent(
        "evt-dir",
        "✅ Created skill directory: /home/box/.agents/skills/demo",
      ),
    ];
    expect(detectSkillCreatorInits(events)).toEqual([
      {
        eventId: "evt-dir",
        skillName: "demo",
        skillPath: "/home/box/.agents/skills/demo",
      },
    ]);
  });

  it("detects FileEditor create of SKILL.md under .agents/skills", () => {
    const events = [
      makeFileEditorEvent(
        "evt-fe",
        "/tmp/ws/.agents/skills/codereview/SKILL.md",
        "create",
      ),
    ];
    expect(detectSkillCreatorInits(events)).toEqual([
      {
        eventId: "evt-fe",
        skillName: "codereview",
        skillPath: "/tmp/ws/.agents/skills/codereview",
      },
    ]);
  });

  it("detects FileEditor create of workspace-relative SKILL.md when allowAnySkillMd", () => {
    const events = [
      makeFileEditorEvent(
        "evt-any",
        "/workspace/my-new-skill/SKILL.md",
        "create",
      ),
    ];
    expect(detectSkillCreatorInits(events)).toEqual([]);
    expect(detectSkillCreatorInits(events, { allowAnySkillMd: true })).toEqual([
      {
        eventId: "evt-any",
        skillName: "my-new-skill",
        skillPath: "/workspace/my-new-skill",
      },
    ]);
  });

  it("ignores FileEditor view of SKILL.md", () => {
    const events = [
      makeFileEditorEvent(
        "evt-view",
        "/tmp/ws/.agents/skills/codereview/SKILL.md",
        "view",
      ),
    ];
    expect(detectSkillCreatorInits(events)).toEqual([]);
  });

  it("ignores bash output without the init success marker", () => {
    const events = [
      makeBashObservationEvent(
        "evt-fail",
        "❌ Error: Skill directory already exists",
      ),
    ];
    expect(detectSkillCreatorInits(events)).toEqual([]);
  });
});
