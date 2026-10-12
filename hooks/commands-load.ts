import type { CommandInfo, FsEntry } from "claude-code";

import type { Origin } from "./row-kit";

export type CommandEntry = { name: string; description: string; origin: Origin };

export type CommandFolders = { home: string; cwd: string };

export type ListDir = (dir: string) => Promise<FsEntry[]>;

type OwnNames = { project: ReadonlySet<string>; global: ReadonlySet<string> };

const COMMANDS_DIR = ".claude/commands";
const COMMAND_EXTENSION = ".md";
const NAMESPACE_SEPARATOR = ":";

let loaded: { key: string; commands: CommandEntry[] } | null = null;

export function resetCommandsCache(): void {
  loaded = null;
}

export function originOfCommand(command: CommandInfo, own: OwnNames): Origin {
  if (command.source !== "user") return "other";
  if (own.project.has(command.name)) return "project";
  return own.global.has(command.name) ? "global" : "other";
}

export async function commandEntriesOf(
  listDir: ListDir,
  listed: readonly CommandInfo[],
  folders: CommandFolders,
  skillNames: ReadonlySet<string>,
): Promise<CommandEntry[]> {
  const commands = listed.filter((command) => !skillNames.has(command.name));
  const key = JSON.stringify([commands, folders]);
  if (loaded?.key === key) return loaded.commands;
  const [project, global] = await Promise.all([
    commandNamesIn(listDir, `${folders.cwd}/${COMMANDS_DIR}`),
    commandNamesIn(listDir, `${folders.home}/${COMMANDS_DIR}`),
  ]);
  const own = { project: new Set(project), global: new Set(global) };
  const entries = commands.map((command) => ({
    name: command.name,
    description: command.description,
    origin: originOfCommand(command, own),
  }));
  loaded = { key, commands: entries };
  return entries;
}

async function commandNamesIn(
  listDir: ListDir,
  dir: string,
  namespace: string[] = [],
): Promise<string[]> {
  const entries = await listDir(dir);
  const names = await Promise.all(
    entries.map((entry) => {
      if (entry.kind === "dir") {
        return commandNamesIn(listDir, `${dir}/${entry.name}`, [...namespace, entry.name]);
      }
      if (entry.kind === "file" && entry.name.endsWith(COMMAND_EXTENSION)) {
        const base = entry.name.slice(0, -COMMAND_EXTENSION.length);
        return Promise.resolve([[...namespace, base].join(NAMESPACE_SEPARATOR)]);
      }
      return Promise.resolve([]);
    }),
  );
  return names.flat();
}
