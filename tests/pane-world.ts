import { expect, mock } from "claude-code/testing";
import type {
  AgentInfo,
  CommandInfo,
  ContextCategory,
  ContextMcpTool,
  ContextSkill,
  FsEntry,
  On,
  SessionMessage,
  TurnUsage,
} from "claude-code";
import type { Engine, MockClock, Mounted } from "claude-code/testing";

import { screenRows } from "./band-screen";

export type Pane = Mounted<"terminal", "Pane">;
export type Size = { columns: number; rows: number };
export type World = {
  clock: MockClock;
  toasts: string[];
  mcpCommands: string[];
  draft: { text: string };
  agentsListed: AgentInfo[];
  messages: Record<string, SessionMessage[]>;
  spawned: number;
  callsMade: number;
  stepUsage: TurnUsage | null;
  usageCalls: { breakdown?: string; columns?: number }[];
  listCalls: number;
  holdTools: Promise<void>;
};
export type WorldSpec = {
  skills?: ContextSkill[];
  commands?: CommandInfo[];
  mcpTools?: ContextMcpTool[];
  categories?: ContextCategory[];
  files?: Record<string, string>;
  dirs?: Record<string, FsEntry[]>;
  failMcpCommands?: boolean;
};

export const NARROW: Size = { columns: 36, rows: 40 };
export const WIDE: Size = { columns: 100, rows: 40 };
export const SHORT: Size = { columns: 60, rows: 12 };
export const TALL: Size = { columns: 60, rows: 60 };
export const SIZES: [string, Size][] = [
  ["narrow", NARROW],
  ["wide", WIDE],
  ["short", SHORT],
  ["tall", TALL],
];
export const HOME = "/h/u";
export const WORK = "/work";
export const NOW = 200_000;
export const FAILING_COMMAND = "fail";
const FLUSH_MS = 400;

const SETTLE_TICKS = 5;
const WINDOW = 200_000;
const MAX_TAB_PAGES = 6;
const NEXT_PAGE_KEY = "tab-right";

export function worldOf(on: On, spec: WorldSpec = {}): World {
  const world: World = {
    clock: mock.clock(on, { now: NOW }),
    toasts: [],
    mcpCommands: [],
    draft: { text: "" },
    agentsListed: [],
    messages: {},
    spawned: 0,
    callsMade: 0,
    stepUsage: null,
    usageCalls: [],
    listCalls: 0,
    holdTools: Promise.resolve(),
  };
  const stored = new Map<string, unknown>();
  mock.env(on, { HOME });
  on("config.list", () => ({ value: [{ key: "theme", value: "dark" }] }) as never);
  on("skill.prompt", (_$, e) => ({ text: e.text }));
  on("classic.SessionStart", () => ({}));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("command.register", () => ({ value: {} }) as never);
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.toast", (_$, e) => {
    world.toasts.push(e.text);
    return { value: undefined };
  });
  on("session.model", () => ({ value: "opus" }));
  on("session.cwd", () => ({ value: WORK }));
  on("session.measure", (_$, e) => ({ changed: e.changed }));
  on("session.usage", (_$, e) => {
    world.usageCalls.push({ breakdown: e.breakdown, columns: e.columns });
    const context =
      e.breakdown === undefined
        ? { window: WINDOW }
        : { window: WINDOW, breakdown: breakdownOf(spec) };
    return { value: { startedAt: 0, context, rateLimits: [] } } as never;
  });
  on("agent.list", () => {
    world.listCalls += 1;
    return { value: world.agentsListed };
  });
  on("agent.spawn", () => ({ model: "sonnet", agentId: `agent-${++world.spawned}` }));
  on("turn.step", async function* (_$, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: "",
      toolUses: [],
      stopReason: "end_turn",
      usage: world.stepUsage,
    };
  });
  on("turn.complete", (_$, e) => ({ text: e.answer }));
  on("session.id", () => ({ value: "session-1" }));
  on("store.get", (_$, e) => ({ value: stored.get(e.key) }));
  on("store.set", (_$, e) => {
    stored.set(e.key, e.value);
    return { value: undefined };
  });
  on("tool.call", async (_$, e) => {
    await world.holdTools;
    const call = e as unknown as { tool: string; command?: string };
    if (call.tool === "Bash" && call.command?.includes(FAILING_COMMAND) === true)
      return { isError: true, result: "boom", text: "boom" } as never;
    return { result: "ok", text: "ok" };
  });
  on("session.messages", (_$, e) => ({
    value: e.agentId === undefined ? [] : (world.messages[e.agentId] ?? []),
  }));
  on("command.list", () => ({ value: spec.commands ?? [] }));
  on("command.run", { command: "mcp" }, (_$, e) => {
    world.mcpCommands.push(e.args);
    if (spec.failMcpCommands === true) throw new Error("refused");
    return {};
  });
  on("prompt.read", () => ({ value: { text: world.draft.text, cursor: world.draft.text.length } }));
  on("prompt.fill", (_$, e) => {
    world.draft.text = e.text;
    return { isFilled: true };
  });
  on("fs.exists", (_$, e) => ({ value: spec.files?.[e.path] !== undefined }));
  on("fs.read", (_$, e) => {
    const text = spec.files?.[e.path];
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`);
    return { value: text };
  });
  on("fs.list", (_$, e) => {
    const entries = spec.dirs?.[e.path];
    if (entries === undefined) throw new Error(`ENOENT: ${e.path}`);
    return { value: entries };
  });
  return world;
}

const CATEGORIES: ContextCategory[] = [
  { name: "System prompt", tokens: 4_000, color: "cyan", isDeferred: false, kind: "used" },
  { name: "Messages", tokens: 30_000, color: "magenta", isDeferred: false, kind: "used" },
  { name: "Free space", tokens: 166_000, color: "grey", isDeferred: false, kind: "free" },
];
const USED_TOKENS = 34_000;
const USED_PERCENT = 17;

function breakdownOf(spec: WorldSpec): object {
  return {
    categories: spec.categories ?? CATEGORIES,
    totalTokens: USED_TOKENS,
    maxTokens: WINDOW,
    rawMaxTokens: WINDOW,
    percentage: USED_PERCENT,
    gridRows: [],
    model: "opus",
    memoryFiles: [],
    agents: [],
    mcpTools: spec.mcpTools ?? [],
    isAutoCompactEnabled: false,
    apiUsage: null,
    skills: {
      totalSkills: spec.skills?.length ?? 0,
      includedSkills: spec.skills?.length ?? 0,
      tokens: 0,
      skillFrontmatter: spec.skills ?? [],
    },
  };
}

export function mountPane($: Engine, size: Size = WIDE): Promise<Pane> {
  return $.ui.mount({
    plugin: "vane",
    surface: "terminal",
    component: "Pane",
    requestId: "session",
    props: {
      title: "Session",
      isFocused: false,
      bodyColumns: size.columns,
      placement: "dock",
      scroll: { offset: 0, bodyRows: size.rows },
      view: {},
    },
    viewport: size,
  });
}

export async function settle(pane: Pane): Promise<void> {
  for (let tick = 0; tick < SETTLE_TICKS; tick++) await pane.redraw();
}

export async function pressButton(pane: Pane, key: string): Promise<void> {
  await pane.press({ key });
  await settle(pane);
}

export async function openTab(pane: Pane, label: string): Promise<void> {
  for (let page = 0; page <= MAX_TAB_PAGES; page++) {
    const buttons = await pane.findAll({ type: "Button" });
    const tab = buttons.find((button) => button.props.label === label);
    if (tab) return pressButton(pane, tab.key ?? "");
    const next = buttons.find((button) => button.key === NEXT_PAGE_KEY);
    expect(next, `a ${label} tab button or a next-page arrow`).toBeDefined();
    await pressButton(pane, NEXT_PAGE_KEY);
  }
  throw new Error(`no ${label} tab on any page`);
}

export async function paneOnTab($: Engine, label: string, size: Size = WIDE): Promise<Pane> {
  const pane = await mountPane($, size);
  await openTab(pane, label);
  return pane;
}

export async function buttonKeys(pane: Pane): Promise<string[]> {
  return (await pane.findAll({ type: "Button" })).map((button) => String(button.key));
}

export async function buttonLabels(pane: Pane): Promise<string[]> {
  return (await pane.findAll({ type: "Button" })).map((button) => String(button.props.label));
}

type Drawn = { type?: string; props?: Record<string, unknown>; children?: unknown };

function withButtonText(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withButtonText);
  if (typeof node !== "object" || node === null) return node;
  const { type, props, children } = node as Drawn;
  if (type === "Button") return { type: "Text", props: {}, children: [props?.label] };
  return { type, props, children: withButtonText(children) };
}

export async function screenOf(pane: Pane, size: Size = WIDE): Promise<string[]> {
  return screenRows(withButtonText(await pane.drawn()), size.columns).map((row) => row.trimEnd());
}

export function rowWith(rows: string[], needle: string): string | undefined {
  return rows.find((row) => row.includes(needle));
}

export async function runTool(
  $: Engine,
  world: World,
  call: { tool: string } & Record<string, unknown>,
): Promise<string> {
  world.callsMade += 1;
  const id = `call-${world.callsMade}`;
  await ($.tool.call as (e: object) => Promise<unknown>)({ ...call, tool_use_id: id });
  await world.clock.advance(FLUSH_MS);
  return id;
}

export async function spawnAgent($: Engine, world: World, description: string): Promise<string> {
  const spawn = await $.agent.spawn({
    tool_use_id: `spawn-${description}`,
    prompt: "do the work",
    description,
    subagentType: "general-purpose",
    provider: "anthropic",
    parentModel: "sonnet",
    background: false,
    fork: false,
  } as never);
  await world.clock.advance(FLUSH_MS);
  return spawn.agentId ?? "";
}

export async function finishAgent($: Engine, world: World, agentId: string): Promise<void> {
  await $.turn.complete({
    answer: "",
    durationMs: 5,
    isAborted: false,
    turnId: `turn-${agentId}`,
    agentId,
    reason: "answer",
  } as never);
  await world.clock.advance(FLUSH_MS);
}

export async function spendTokens(
  $: Engine,
  world: World,
  agentId: string,
  tokens: number,
): Promise<void> {
  world.stepUsage = {
    model: "sonnet",
    input_tokens: tokens,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  const stream = $.turn.step({
    turnId: `step-${agentId}`,
    index: 0,
    model: "sonnet",
    effort: "high",
    messageCount: 1,
    agentId,
  } as never);
  for await (const _chunk of stream) continue;
  await world.clock.advance(FLUSH_MS);
}
