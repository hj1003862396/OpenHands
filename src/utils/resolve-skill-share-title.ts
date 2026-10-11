import { FileClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import SkillsService from "#/api/skills-service";
import type { SkillInfo } from "#/types/settings";
import {
  chooseSkillShareTitle,
  extractSkillShortTitle,
  rememberSkillShareTitle,
  skillMarkdownPath,
  type SkillShareCodeEntry,
  type SkillShareTitleChoice,
} from "./skill-share-codes";

export interface SkillShareTitleSources {
  loadSkills: (entry: SkillShareCodeEntry) => Promise<SkillInfo[]>;
  readSkillMarkdown: (skillPath: string) => Promise<string | null>;
}

function normalizeStoredPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function findSkillForEntry(
  skills: SkillInfo[],
  entry: SkillShareCodeEntry,
): SkillInfo | undefined {
  const byName = skills.find((skill) => skill.name === entry.skillName);
  if (byName) return byName;
  if (!entry.skillPath) return undefined;
  const skillPath = normalizeStoredPath(entry.skillPath);
  return skills.find((skill) => {
    if (!skill.source) return false;
    const source = normalizeStoredPath(skill.source);
    return (
      source === skillPath ||
      source.startsWith(`${skillPath}/`) ||
      skillPath.startsWith(`${source}/`)
    );
  });
}

async function loadSkillsForEntry(
  entry: SkillShareCodeEntry,
): Promise<SkillInfo[]> {
  try {
    return await SkillsService.getSkills(entry.workspacePath ?? undefined);
  } catch {
    return [];
  }
}

async function readSkillMarkdownFile(
  skillPath: string,
): Promise<string | null> {
  try {
    return await new FileClient(getAgentServerClientOptions()).downloadTextFile(
      skillMarkdownPath(skillPath),
    );
  } catch {
    return null;
  }
}

/**
 * Resolve the short title used in a skill-code share blurb.
 * Prefers the first `#` heading from the skills list or SKILL.md, then
 * the stored title, the skills-API name, and finally the English skill name.
 * A heading resolved here is written back onto the saved code.
 */
export async function resolveSkillShareShortTitle(
  entry: SkillShareCodeEntry,
  sources?: Partial<SkillShareTitleSources>,
): Promise<SkillShareTitleChoice> {
  const loadSkills = sources?.loadSkills ?? loadSkillsForEntry;
  const readSkillMarkdown = sources?.readSkillMarkdown ?? readSkillMarkdownFile;

  let skills: SkillInfo[] = [];
  try {
    skills = await loadSkills(entry);
  } catch {
    skills = [];
  }

  const skill = findSkillForEntry(skills, entry);
  const skillContent = skill?.content ?? null;
  const apiDisplay = skill?.name?.trim() || null;

  let fileContent: string | null = null;
  if (!extractSkillShortTitle(skillContent) && entry.skillPath) {
    try {
      fileContent = await readSkillMarkdown(entry.skillPath);
    } catch {
      fileContent = null;
    }
  }

  const choice = chooseSkillShareTitle({
    skillName: entry.skillName,
    storedTitle: entry.skillTitle,
    markdown: [skillContent, fileContent],
    apiDisplay,
  });

  if (choice.fromMarkdown) {
    rememberSkillShareTitle(entry.code, choice.title);
  }

  return choice;
}
