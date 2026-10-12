import { describe, expect, mock, test } from "claude-code/testing";
import type { On, PromptComposeSection } from "claude-code";
import type { Engine, MockClock } from "claude-code/testing";

type StartedCall = { id: string; done: Promise<unknown> };
type World = {
  clock: MockClock;
  writes: string[];
  submittedContext: (readonly string[] | undefined)[];
  startCall: (ms: number) => Promise<StartedCall>;
};

const COLUMNS = 100;
const HOME_DIR = "/Users/dev";
const NOTHING_IS_EXPANDED = false;
const MEASURED_TOKENS = 42_000;
const MEASURED_FIVE_HOUR_PERCENT = 17;
const LONG_TURN_MS = 60_000;
const SHORT_TURN_MS = 1_000;
const ENGINE_SECTIONS: PromptComposeSection[] = [
  { id: "intro", text: "You are an engineering assistant.", scope: "shared" },
  { id: "env", text: "Working directory: /work", scope: "session" },
];

describe("tool rows", () => {
  test("S1 ending the second tool call leaves the first row exactly as drawn, and the second row shows its own time", async ($, on) => {
    const world = worldOf($, on);
    const first = await world.startCall(2_000);
    await world.clock.advance(2_000);
    await first.done;
    const second = await world.startCall(5_000);
    const firstRow = await mountToolRow($, first.id, false);
    const secondRow = await mountToolRow($, second.id, true);
    const firstBefore = await firstRow.drawn();

    await world.clock.advance(5_000);
    await second.done;
    await secondRow.redraw(toolRowProps(second.id, false));
    const firstAfter = await firstRow.drawn();

    expect(firstAfter).toEqual(firstBefore);
    expect(shownText(firstAfter)).toContain("2s");
    expect(shownText(await secondRow.drawn())).toContain("5s");
  });

  test("S2 a tool group row shows the time of its calls together, and an unrelated call ending does not redraw it", async ($, on) => {
    const world = worldOf($, on);
    const first = await world.startCall(2_000);
    const second = await world.startCall(3_000);
    await world.clock.advance(3_000);
    await Promise.all([first.done, second.done]);
    const unrelated = await world.startCall(7_000);
    const group = await mountToolGroup($, [first.id, second.id]);
    const before = await group.drawn();

    await world.clock.advance(7_000);
    await unrelated.done;
    const after = await group.drawn();

    expect(after).toEqual(before);
    expect(shownText(before)).toContain("5s");
  });
});

describe("turn footers", () => {
  test("S3 the footer of a short 41st turn still shows its counts after a 42nd turn ends", async ($, on) => {
    const world = worldOf($, on);
    for (let turn = 0; turn < 40; turn++) await endTurn($, world, LONG_TURN_MS + turn * 1_000, 0);
    await endTurn($, world, SHORT_TURN_MS, 1);

    await endTurn($, world, LONG_TURN_MS * 2, 0);

    const footer = await mountFooter($, SHORT_TURN_MS);
    expect(shownText(await footer.drawn())).toContain("1 file read");
  });
});

describe("usage meters", () => {
  test("S4 the same measure twice writes usage once and the status line shows the measured figures", async ($, on) => {
    const world = worldOf($, on);

    await measure($, MEASURED_TOKENS, MEASURED_FIVE_HOUR_PERCENT);
    await measure($, MEASURED_TOKENS, MEASURED_FIVE_HOUR_PERCENT);

    expect(world.writes.filter((key) => key === "usage")).toHaveLength(1);
    const shown = shownText(await mountStatusLine($));
    expect(shown).toContain("42.0k");
    expect(shown).toContain("17%");
  });
});

describe("diagram hint", () => {
  test("S8 a typed prompt reaches the model with no hint context", async ($, on) => {
    const world = worldOf($, on);

    await $.prompt.submit({
      text: "Show me the request flow",
      origin: { kind: "composer" },
      wait: false,
    });

    expect(world.submittedContext).toEqual([undefined]);
  });

  test("S9 the system prompt keeps the engine sections and gains one session section about tables, alerts and mermaid diagrams", async ($, on) => {
    worldOf($, on);

    const composed = await $.prompt.compose({
      model: "m",
      promptModel: "m",
      surfaces: ["terminal"],
      tools: [],
      outputStyle: null,
      traits: [],
    });

    expect(composed.sections).toHaveLength(ENGINE_SECTIONS.length + 1);
    expect(composed.sections.slice(0, ENGINE_SECTIONS.length)).toEqual(ENGINE_SECTIONS);
    expect(composed.sections.at(-1)?.scope).toBe("session");
    expect(composed.sections.at(-1)?.text).toContain("mermaid");
    expect(composed.sections.at(-1)?.text).toContain("[!NOTE]");
  });
});

function worldOf($: Engine, on: On): World {
  const clock = mock.clock(on);
  mock.env(on, { HOME: HOME_DIR });
  const writes: string[] = [];
  const submittedContext: (readonly string[] | undefined)[] = [];
  const startedIds: string[] = [];

  on("state.set", (_$, e, next) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (e.plugin === "vane") writes.push(e.key);
    return next(e);
  });
  on("tool.call", async (_$, e) => {
    startedIds.push(e.tool_use_id);
    await clock.sleep(Number((e as { file_path?: string }).file_path));
    return { result: "ok", text: "ok" };
  });
  on("turn.start", (_$, e) => ({ turnId: e.turnId }));
  on("turn.complete", (_$, e) => ({ text: e.answer }));
  on("session.measure", (_$, e) => ({ changed: e.changed }));
  on("session.usage", () => ({ value: DEFAULT_USAGE }));
  on("prompt.submit", (_$, e) => {
    submittedContext.push(e.context);
    return { text: e.text };
  });
  on("prompt.compose", () => ({ sections: ENGINE_SECTIONS }));

  const startCall = async (ms: number): Promise<StartedCall> => {
    const done = $.tool.call({ tool: "Read", file_path: String(ms) });
    await clock.settle();
    return { id: startedIds.at(-1) ?? "", done };
  };
  return { clock, writes, submittedContext, startCall };
}

function toolRowProps(id: string, isRunning: boolean) {
  return {
    tool_use_id: id,
    tool: "Read",
    input: {},
    isRunning,
    isErrored: false,
    isInterrupted: false,
  };
}

function mountToolRow($: Engine, id: string, isRunning: boolean) {
  return $.ui.mount({
    plugin: "vane",
    surface: "terminal",
    component: "ToolUse",
    props: toolRowProps(id, isRunning),
    requestId: id,
    viewport: { columns: COLUMNS, rows: 40 },
  });
}

function mountToolGroup($: Engine, ids: string[]) {
  return $.ui.mount({
    plugin: "vane",
    surface: "terminal",
    component: "ToolGroup",
    props: {
      calls: ids.map((id) => toolRowProps(id, false)),
      isActive: false,
      isExpanded: NOTHING_IS_EXPANDED,
    },
    requestId: `group-${ids.join("-")}`,
    viewport: { columns: COLUMNS, rows: 40 },
  });
}

function mountFooter($: Engine, durationMs: number) {
  return $.ui.mount({
    plugin: "vane",
    surface: "terminal",
    component: "TurnDuration",
    props: { word: "Baked", durationMs },
    viewport: { columns: COLUMNS, rows: 40 },
  });
}

async function mountStatusLine($: Engine) {
  const mounted = await $.ui.mount({
    plugin: "vane",
    surface: "terminal",
    component: "PromptHint",
    props: { isDraft: false, isWorking: false, hint: "" },
    viewport: { columns: COLUMNS, rows: 40 },
  });
  return mounted.drawn();
}

const DEFAULT_USAGE = {
  startedAt: 0,
  context: { window: 200_000 },
  rateLimits: [{ kind: "five_hour", percentUsed: 5 }],
};

function measure($: Engine, tokens: number, fiveHourPercent: number) {
  return $.session.measure({
    context: { window: 200_000, tokens },
    rateLimits: [{ kind: "five_hour", percentUsed: fiveHourPercent }],
    changed: ["context", "rateLimits"],
  });
}

async function endTurn(
  $: Engine,
  world: World,
  durationMs: number,
  fileReads: number,
): Promise<void> {
  const turnId = `turn-${durationMs}`;
  await $.turn.start({ text: "go", turnId });
  for (let read = 0; read < fileReads; read++) {
    const call = await world.startCall(1);
    await world.clock.advance(1);
    await call.done;
  }
  await $.turn.complete({ answer: "", durationMs, isAborted: false, turnId, reason: "answer" });
}

function shownText(node: unknown): string {
  if (typeof node === "string") return node;
  const children = (node as { children?: unknown[] } | undefined)?.children ?? [];
  return children.map(shownText).join("");
}
