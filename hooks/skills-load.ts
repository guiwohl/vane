import type { CommandInfo, ContextSkill } from "claude-code";

import type { SkillEntry } from "./skills-draw";

export type ReadText = (path: string) => Promise<string>;

const PLUGIN_REGISTRY_FILE = ".claude/plugins/installed_plugins.json";
const SKILL_FILE = "SKILL.md";
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const BLOCK_SCALAR = /^[>|][+-]?$/;
const SURROUNDING_QUOTES = /^(["'])(.*)\1$/;
const DESCRIPTION_KEY = "description:";

export type Folders = { home: string; cwd: string };

type Loaded = { key: string; skills: SkillEntry[] };

let loaded: Loaded | null = null;
let pluginRoots: Map<string, string> | null = null;

export function resetSkillsCache(): void {
  loaded = null;
  pluginRoots = null;
}

export async function skillEntriesOf(
  readText: ReadText,
  listed: ContextSkill[],
  folders: Folders,
  commands: readonly CommandInfo[],
): Promise<SkillEntry[]> {
  const key = JSON.stringify([listed, folders]);
  if (loaded?.key === key) return loaded.skills;
  const roots = await pluginRootsOf(readText, folders.home);
  const commandDescriptions = new Map(
    commands.map((command) => [command.name, command.description]),
  );
  const unique = [
    ...new Map(listed.map((skill) => [`${skill.source}:${skill.name}`, skill])).values(),
  ];
  const skills = (
    await Promise.all(unique.map((skill) => entryOf(readText, skill, folders, roots)))
  ).map((entry) => ({
    ...entry,
    description: entry.description || (commandDescriptions.get(entry.name) ?? ""),
  }));
  loaded = { key, skills };
  return skills;
}

async function entryOf(
  readText: ReadText,
  skill: ContextSkill,
  folders: Folders,
  roots: Map<string, string>,
): Promise<SkillEntry> {
  if (skill.source === "built-in") {
    return { name: skill.name, description: "", owner: "built-in" };
  }
  if (skill.source === "plugin" || skill.source === "mcp") {
    const plugin = skill.pluginName ?? skill.name.split(":")[0] ?? skill.source;
    const root = roots.get(plugin);
    const folder = skill.name.split(":").pop() ?? skill.name;
    const text = root === undefined ? "" : await pluginSkillText(readText, root, folder);
    return { name: skill.name, description: descriptionOf(text), owner: "plugin", plugin };
  }
  const projectText = await readText(skillPath(folders.cwd, skill.name));
  if (projectText !== "") {
    return { name: skill.name, description: descriptionOf(projectText), owner: "project" };
  }
  const userText = await readText(skillPath(folders.home, skill.name));
  if (userText !== "") {
    return { name: skill.name, description: descriptionOf(userText), owner: "user" };
  }
  return { name: skill.name, description: "", owner: "built-in" };
}

async function pluginSkillText(readText: ReadText, root: string, folder: string): Promise<string> {
  const skillText = await readText(`${root}/skills/${folder}/${SKILL_FILE}`);
  return skillText === "" ? readText(`${root}/commands/${folder}.md`) : skillText;
}

function skillPath(base: string, name: string): string {
  return `${base}/.claude/skills/${name}/${SKILL_FILE}`;
}

async function pluginRootsOf(readText: ReadText, home: string): Promise<Map<string, string>> {
  if (pluginRoots !== null) return pluginRoots;
  const text = await readText(`${home}/${PLUGIN_REGISTRY_FILE}`);
  const registry = parseRegistry(text);
  pluginRoots = new Map(
    Object.entries(registry).flatMap(([id, installs]) => {
      const root = installs[0]?.installPath;
      return root === undefined ? [] : [[id.split("@")[0] ?? id, root] as const];
    }),
  );
  return pluginRoots;
}

function parseRegistry(text: string): Record<string, { installPath?: string }[]> {
  try {
    const parsed = JSON.parse(text) as { plugins?: Record<string, { installPath?: string }[]> };
    return parsed.plugins ?? {};
  } catch {
    return {};
  }
}

function descriptionOf(skillText: string): string {
  const block = FRONTMATTER.exec(skillText)?.[1];
  if (block === undefined) return "";
  const lines = block.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(DESCRIPTION_KEY));
  if (start === -1) return "";
  const first = (lines[start] ?? "").slice(DESCRIPTION_KEY.length).trim();
  const continuation = lines
    .slice(start + 1)
    .filter((line) => line.trim() === "" || /^\s/.test(line))
    .map((line) => line.trim());
  const parts = BLOCK_SCALAR.test(first) ? continuation : [first, ...continuation];
  const joined = parts.filter((part) => part !== "").join(" ");
  return joined.replace(SURROUNDING_QUOTES, "$2");
}
