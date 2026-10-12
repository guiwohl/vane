import { describe, expect, mock, test } from "claude-code/testing";
import type { AgentInfo, On } from "claude-code";
import type { Engine, Mounted } from "claude-code/testing";

import type { AgentNode } from "../hooks/agents-model";
import { palette } from "../hooks/palette";
import { ENGINE_DEFAULT_GREY, accentOf } from "../hooks/session-color";

type Pane = Mounted<"terminal", "Pane">;
type Mount = { findAll: Pane["findAll"] };

const RED = accentOf("red");
const DEFAULT_GREY = ENGINE_DEFAULT_GREY;
const COLUMNS = 100;
const NOW = 200_000;
const OVERVIEW_HEADERS = ["Gauges", "Trend", "Tool mix", "Now"];
const store = new Map<string, { value: unknown; version: number }>();

describe("tool header", () => {
  test("A1 the TOOL label and its rule take the session colour", async ($, on) => {
    worldOf(on, "red");

    const group = await mountToolGroup($);

    expect(await colorsOf(group, "TOOL")).toEqual([RED]);
    expect(await colorsOf(group, "──")).toEqual([RED]);
  });

  test("A2 with no colour set the TOOL header takes the engine default grey", async ($, on) => {
    worldOf(on, "default");

    const group = await mountToolGroup($);

    expect(await colorsOf(group, "TOOL")).toEqual([DEFAULT_GREY]);
    expect(await colorsOf(group, "──")).toEqual([DEFAULT_GREY]);
  });

  test("A3 the Failed word keeps its status colour under a session colour", async ($, on) => {
    worldOf(on, "red");

    const group = await mountToolGroup($, { isErrored: true });

    expect(await colorsOf(group, "Failed")).toEqual([palette.failed]);
  });
});

describe("activity pane", () => {
  test("A4 the section headers do not take a session colour", async ($, on) => {
    worldOf(on, "blue");

    const pane = await mountPane($);

    for (const name of OVERVIEW_HEADERS)
      expect(await colorsOf(pane, name)).not.toContain(accentOf("blue"));
  });

  test("A5 the section headers all share one colour that is the same with no session colour", async ($, on) => {
    worldOf(on, "default");
    const plain = await mountPane($);
    const plainColors = await Promise.all(OVERVIEW_HEADERS.map((name) => colorsOf(plain, name)));

    expect(plainColors.flat().length).toBeGreaterThan(0);
    expect(new Set(plainColors.flat()).size).toBe(1);
  });
});

describe("subagents pane", () => {
  test("A7 the Spend header is plain white, its bars and the tree guides ignore the session colour, the status dots keep theirs", async ($, on) => {
    worldOf(on, "red");
    store.set("agents", { value: { a: agent("a", "alpha") }, version: 1 });

    const pane = await mountPane($, "Agents");

    expect(await colorsOf(pane, "Spend")).toEqual([palette.userText]);
    expect(await colorsOf(pane, "▰▰▰▰▰▰")).toEqual([palette.tool]);
    expect(await colorsOf(pane, "└─ ")).toEqual([palette.rule]);
    expect(await colorsOf(pane, "●")).toEqual([palette.tool]);
  });

  test("A8 with no colour set the Spend bar has the same colour", async ($, on) => {
    worldOf(on, "default");
    store.set("agents", { value: { a: agent("a", "alpha") }, version: 1 });

    const pane = await mountPane($, "Agents");

    expect(await colorsOf(pane, "▰▰▰▰▰▰")).toEqual([palette.tool]);
  });
});

function worldOf(on: On, colorName: string): void {
  store.clear();
  store.set("sessionColor", { value: colorName, version: 1 });
  mock.clock(on, { now: NOW });
  mock.env(on, { HOME: "/h/u" });
  on("state.get", (_$, e, next) => {
    const seeded = store.get(e.key);
    return seeded ? { value: seeded } : next(e);
  });
  on("state.set", (_$, e, next) => {
    store.delete(e.key);
    return next(e);
  });
  on("classic.SessionStart", () => ({}));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("session.usage", () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }));
  on("session.model", () => ({ value: "opus" }));
  on("session.cwd", () => ({ value: "/work" }));
  on("agent.list", () => ({ value: [] as unknown as AgentInfo[] }));
  on("fs.exists", () => ({ value: true }));
}

function mountToolGroup($: Engine, call: { isErrored?: boolean } = {}) {
  return $.ui.mount({
    plugin: "vane",
    surface: "terminal",
    component: "ToolGroup",
    props: {
      calls: [
        {
          tool_use_id: "g1",
          tool: "Read",
          input: {},
          isRunning: false,
          isErrored: false,
          isInterrupted: false,
          ...call,
        },
      ],
      isActive: false,
      isExpanded: false,
    },
    viewport: { columns: COLUMNS, rows: 24 },
  });
}

async function mountPane($: Engine, tab?: string): Promise<Pane> {
  const pane = await $.ui.mount({
    plugin: "vane",
    surface: "terminal",
    component: "Pane",
    requestId: "session",
    props: {
      title: "Session",
      isFocused: false,
      bodyColumns: COLUMNS,
      placement: "dock",
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
    viewport: { columns: COLUMNS, rows: 40 },
  });
  if (tab === undefined) return pane;
  const buttons = await pane.findAll({ type: "Button" });
  await pane.press({ key: buttons.find((button) => button.props.label === tab)?.key ?? "" });
  return pane;
}

async function colorsOf(mount: Mount, text: string): Promise<unknown[]> {
  const colors = (await mount.findAll({ type: "Text", text }))
    .map((node) => node.props.color)
    .filter((color) => color !== undefined);
  return [...new Set(colors)];
}

function agent(id: string, description: string): AgentNode {
  return {
    id,
    type: "general-purpose",
    description,
    background: false,
    model: "sonnet",
    status: "running",
    startedAt: NOW - 10_000,
    ctxTokens: 0,
    tokensIn: 5_000,
    tokensOut: 1_000,
    running: [],
  };
}
