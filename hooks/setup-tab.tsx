import { atom, read, update } from "claude-code";
import type { EngineInterface, On, SessionContextBreakdown } from "claude-code";

import { markContextStale, mcpBreakdown } from "./breakdown";
import { commandsTab } from "./commands-draw";
import { commandEntriesOf, resetCommandsCache } from "./commands-load";
import type { CommandEntry } from "./commands-load";
import { singleLine } from "./format";
import { mcpServerCount, mcpTab } from "./mcp-draw";
import type { McpView } from "./mcp-draw";
import { mcpConfigOf, resetMcpConfig } from "./mcp-config";
import type { McpConfig } from "./mcp-config";
import { mcpCommandName } from "./mcp-name";
import { TOOL_USES_KEY } from "./mcp-track";
import { PANE } from "./pane-tab";
import { BODY_INDENT_CELLS, setupTab } from "./setup-draw";
import { isShownTab, justEntered } from "./shown-tab";
import { skillsTab } from "./skills-draw";
import type { SkillEntry, SkillsView } from "./skills-draw";
import { resetSkillsCache, skillEntriesOf } from "./skills-load";
import type { Folders } from "./skills-load";
import type { McpAction } from "./servers";
import { withoutFolder } from "./use-counts";
import type { UseCounts } from "./use-counts";

export const SETUP_TAB = { id: "setup", label: "Setup" };

const UNSAFE_SERVER_NAME = /[\s\p{Cc}]/u;

type McpData = { context: SessionContextBreakdown | null; config: McpConfig };

let openSections: string[] = [];

const loaded: {
  skills: SkillEntry[] | undefined;
  commands: CommandEntry[] | undefined;
  mcp: McpData | undefined;
} = { skills: undefined, commands: undefined, mcp: undefined };

const launchFolderAtom = atom({ plugin: "vane", key: "launchFolder" } as const, "");
const skillUsesAtom = atom(
  { plugin: "vane", key: "skillUses" } as const,
  {} as Record<string, number>,
);
const commandUsesAtom = atom(
  { plugin: "vane", key: "commandUses" } as const,
  {} as Record<string, number>,
);
const skillsExpandedAtom = atom({ plugin: "vane", key: "skillsExpanded" } as const, [] as string[]);
const toolUsesAtom = atom(
  { plugin: "vane", key: "toolUses" } as const,
  {} as Record<string, number>,
);
const mcpSeenAtom = atom({ plugin: "vane", key: "mcpSeen" } as const, [] as string[]);
const mcpOpenAtom = atom({ plugin: "vane", key: "mcpOpen" } as const, [] as string[]);
const mcpQueuedAtom = atom({ plugin: "vane", key: "mcpQueued" } as const, [] as string[]);

export function registerSetupTab(on: On): void {
  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e, next) => {
    if (!isShownTab(SETUP_TAB.id)) return next(e);
    const isEntering = justEntered(SETUP_TAB.id);
    if (isEntering) resetSetup();
    const width = e.props.bodyColumns;
    const bodyWidth = width - BODY_INDENT_CELLS;
    const open = openSections;
    const [skillUses, commandUses] = await Promise.all([
      read($, skillUsesAtom),
      read($, commandUsesAtom),
    ]);
    const { skills, commands, mcp } = loaded;
    const skillsView = skills && (await skillsViewOf($, skills, bodyWidth, skillUses));
    const mcpView = mcp && (await mcpViewOf($, mcp, bodyWidth));
    const ui = $.ui.resolve(e);
    return setupTab(ui, width, [
      {
        id: "skills",
        title: "Skills",
        count: skills?.length,
        isOpen: open.includes("skills"),
        toggle: toggle($, "skills", skills ? undefined : () => loadSkills($)),
        body: skillsView && (() => skillsTab(ui, skillsView)),
      },
      {
        id: "commands",
        title: "Commands",
        count: commands?.length,
        isOpen: open.includes("commands"),
        toggle: toggle($, "commands", commands ? undefined : () => loadCommands($)),
        body:
          commands &&
          (() =>
            commandsTab(ui, {
              width: bodyWidth,
              commands,
              uses: commandUses,
              insert: (name) => void insertCommand($, name),
            })),
      },
      {
        id: "mcps",
        title: "MCPs",
        count: mcpView && mcpServerCount(mcpView),
        isOpen: open.includes("mcps"),
        toggle: toggle($, "mcps", mcp ? undefined : () => loadMcp($)),
        body: mcpView && (() => mcpTab(ui, mcpView)),
      },
    ]);
  });
}

function toggle(
  $: EngineInterface,
  id: string,
  load: (() => Promise<unknown>) | undefined,
): () => void {
  return () => void toggleSection($, id, load);
}

async function toggleSection(
  $: EngineInterface,
  id: string,
  load: (() => Promise<unknown>) | undefined,
): Promise<void> {
  const isOpening = !openSections.includes(id);
  openSections = isOpening ? [...openSections, id] : openSections.filter((open) => open !== id);
  $.ui.invalidate("ui.render");
  if (isOpening) await load?.();
}

function resetSetup(): void {
  markContextStale();
  resetSkillsCache();
  resetCommandsCache();
  resetMcpConfig();
  loaded.skills = undefined;
  loaded.commands = undefined;
  loaded.mcp = undefined;
  openSections = [];
}

async function foldersOf($: EngineInterface): Promise<Folders> {
  const [home, cwd] = await Promise.all([$.env.get("HOME"), $.session.cwd()]);
  return { home: home ?? "", cwd };
}

function contextOf($: EngineInterface): Promise<SessionContextBreakdown | null> {
  return mcpBreakdown((args) => $.session.usage(args)).catch(() => null);
}

async function loadSkills($: EngineInterface): Promise<SkillEntry[]> {
  const [context, listed, folders] = await Promise.all([
    contextOf($),
    $.command.list().catch(() => []),
    foldersOf($),
  ]);
  const skills = await skillEntriesOf(
    (path) => $.fs.read(path).catch(() => ""),
    context?.skills?.skillFrontmatter ?? [],
    folders,
    listed,
  );
  loaded.skills = skills;
  $.ui.invalidate("ui.render");
  return skills;
}

async function loadCommands($: EngineInterface): Promise<void> {
  const [skills, listed, folders] = await Promise.all([
    loaded.skills ?? loadSkills($),
    $.command.list().catch(() => []),
    foldersOf($),
  ]);
  loaded.commands = await commandEntriesOf(
    (dir) => $.fs.list(dir).catch(() => []),
    listed,
    folders,
    new Set(skills.map(({ name }) => name)),
  );
  $.ui.invalidate("ui.render");
}

async function loadMcp($: EngineInterface): Promise<void> {
  const folders = await foldersOf($);
  const [context, config] = await Promise.all([
    contextOf($),
    mcpConfigOf((path) => $.fs.read(path).catch(() => ""), folders.home, folders.cwd),
  ]);
  loaded.mcp = { context, config };
  $.ui.invalidate("ui.render");
}

async function skillsViewOf(
  $: EngineInterface,
  skills: SkillEntry[],
  width: number,
  uses: Record<string, number>,
): Promise<SkillsView> {
  const expanded = await read($, skillsExpandedAtom);
  return {
    width,
    uses,
    skills,
    expanded: new Set(expanded),
    toggle: (name) =>
      void update($, skillsExpandedAtom, (list) =>
        list.includes(name) ? list.filter((open) => open !== name) : [...list, name],
      ),
    insert: (name) => void insertCommand($, name),
  };
}

async function mcpViewOf($: EngineInterface, mcp: McpData, width: number): Promise<McpView> {
  const [seen, queuedServers, openServers, toolUses] = await Promise.all([
    read($, mcpSeenAtom),
    read($, mcpQueuedAtom),
    read($, mcpOpenAtom),
    read($, toolUsesAtom),
  ]);
  return {
    context: mcp.context,
    width,
    disabledServers: [...new Set([...seen, ...mcp.config.disabled])],
    scopes: mcp.config.scopes,
    queuedServers,
    openServers: new Set(openServers),
    toolUses,
    clearUses: () => void clearToolUses($),
    toggle: (server) =>
      void update($, mcpOpenAtom, (list) =>
        list.includes(server) ? list.filter((open) => open !== server) : [...list, server],
      ),
    act: (action, server) => void requestMcp($, action, server, mcp.context),
  };
}

async function clearToolUses($: EngineInterface): Promise<void> {
  const folder = await read($, launchFolderAtom);
  const stored = ((await $.store.get(TOOL_USES_KEY)) ?? {}) as UseCounts;
  await $.store.set(TOOL_USES_KEY, withoutFolder(stored, folder));
  await update($, toolUsesAtom, () => ({}));
}

async function insertCommand($: EngineInterface, name: string): Promise<void> {
  const { text } = await $.prompt.read();
  if (text.startsWith(`/${name} `)) return;
  await $.prompt.fill({ text: `/${name} ${text}` });
}

async function rememberServers(
  $: EngineInterface,
  breakdown: SessionContextBreakdown | null,
): Promise<void> {
  const live = (breakdown?.mcpTools ?? []).map((tool) => mcpCommandName(tool.serverName));
  await update($, mcpSeenAtom, (list) => [...new Set([...list, ...live])]);
}

async function finishMcp($: EngineInterface, server: string): Promise<void> {
  await update($, mcpQueuedAtom, (list) => list.filter((name) => name !== server));
  resetMcpConfig();
  markContextStale();
  $.ui.invalidate("ui.render");
  await loadMcp($);
}

async function requestMcp(
  $: EngineInterface,
  action: McpAction,
  server: string,
  breakdown: SessionContextBreakdown | null,
): Promise<void> {
  if (UNSAFE_SERVER_NAME.test(server)) {
    $.ui.toast(
      `Cannot ${action} "${singleLine(server)}": the name has spaces or control characters`,
    );
    return;
  }
  await rememberServers($, breakdown);
  await update($, mcpQueuedAtom, (list) => [...list, server]);
  $.ui.invalidate("ui.render");
  void $.command
    .run({ command: "mcp", args: `${action} ${server}` })
    .catch((error: unknown) => $.ui.toast(`/mcp ${action} ${server} failed: ${String(error)}`))
    .finally(() => finishMcp($, server));
}
