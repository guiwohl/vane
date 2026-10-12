import { describe, expect, mock, test } from "claude-code/testing";
import type { AgentInfo, On, SessionMessage, ToolUseSummary } from "claude-code";
import type { Engine, Mounted } from "claude-code/testing";

import type { AgentNode } from "../hooks/agents-model";
import type { CallRecord } from "../types";

type Pane = Mounted<"terminal", "Pane">;
type Node = {
  type: string;
  props?: { label?: string; text?: string; source?: string };
  children?: unknown[];
};

const NOW = 200_000;
const COLUMNS = 60;
const ROWS = 40;
const POLL_MS = 1_000;
const FLUSH_MS = 400;

const store = new Map<string, { value: unknown; version: number }>();
let transcript: SessionMessage[] = [];
let requestedAgents: unknown[] = [];
let listedStatus = "running";
let writtenKeys: string[] = [];
const written = new Map<string, unknown>();

describe("opening a subagent", () => {
  test("A1 pressing an agent row shows that agent's messages in the pane", async ($, on) => {
    worldOf(on);
    const pane = await paneWithAgents($);

    await pane.press({ key: "agent-scout" });

    const text = await textsOf(pane);
    expect(text).toContain("audit the parser");
    expect(text).toContain("found two bugs");
    expect(text).not.toContain("other agent");
    expect(requestedAgents).toContain("scout");
  });

  test("A2 the back button returns to the list of agents", async ($, on) => {
    worldOf(on);
    const pane = await paneWithAgents($);
    await pane.press({ key: "agent-scout" });

    await pane.press({ key: "back" });

    const text = await textsOf(pane);
    expect(text).toContain("scout the repo");
    expect(text).not.toContain("other agent");
    expect(text).not.toContain("found two bugs");
  });

  test("A3 a poll tick while an agent is open brings in its new messages", async ($, on) => {
    const clock = worldOf(on);
    const pane = await paneWithAgents($);
    await pane.press({ key: "agent-scout" });

    transcript = [...transcript, message("assistant", "fixed the second bug")];
    await clock.advance(POLL_MS);

    expect(await textsOf(pane)).toContain("fixed the second bug");
  });
});

describe("following and keeping a subagent's transcript", () => {
  test("A13 an open transcript closes itself when its agent stops and the list no longer shows it", async ($, on) => {
    const clock = worldOf(on);
    const pane = await paneWithAgents($);
    await pane.press({ key: "agent-scout" });
    expect(await textsOf(pane)).toContain("found two bugs");

    listedStatus = "completed";
    await clock.advance(POLL_MS + FLUSH_MS);
    await pane.redraw();

    const text = await textsOf(pane);
    expect(text).not.toContain("found two bugs");
    expect(text).not.toContain("scout the repo");
    expect(text).toContain("no agents running");
    expect(written.get("openAgent")).toBeNull();
  });

  test("A14 the transcript is read from the engine, never written to plugin state", async ($, on) => {
    const clock = worldOf(on);
    const pane = await paneWithAgents($);

    await pane.press({ key: "agent-scout" });
    await clock.advance(POLL_MS);

    expect(await textsOf(pane)).toContain("found two bugs");
    expect(writtenKeys).toContain("openAgent");
    expect(writtenKeys).not.toContain("agentMessages");
  });

  test("A15 after /clear a pane mounted again lists the agents instead of reopening the transcript", async ($, on) => {
    worldOf(on);
    const pane = await paneWithAgents($);
    await pane.press({ key: "agent-scout" });

    await $.classic.SessionStart({ source: "clear" });
    await pane.unmount();
    const again = await paneWithAgents($);

    const text = await textsOf(again);
    expect(text).toContain("scout the repo");
    expect(text).not.toContain("found two bugs");
  });
});

describe("reading a subagent's transcript", () => {
  test("A4 the task handed over is labelled Main-Agent and the subagent's replies carry its own name", async ($, on) => {
    worldOf(on);
    const pane = await paneWithAgents($, [
      { ...node("scout", "scout the repo", "running"), name: "parser-auditor" },
    ]);
    await pane.press({ key: "agent-scout" });

    const text = await textsOf(pane);
    expect(labelsOf(text)).toEqual(["Main-Agent", "parser-auditor"]);
    expect(text).toContain("parser-auditor · scout the repo");
  });

  test("A5 a subagent without a name is labelled by its type", async ($, on) => {
    worldOf(on);
    const pane = await paneWithAgents($, [node("scout", "scout the repo", "running")]);
    await pane.press({ key: "agent-scout" });

    expect(labelsOf(await textsOf(pane))).toEqual(["Main-Agent", "Explore"]);
  });

  test("A6 consecutive messages of one role are one block with one label", async ($, on) => {
    worldOf(on);
    transcript = [
      message("user", "audit the parser"),
      message("assistant", "first reply"),
      message("assistant", "second reply", [use("t1", "Read", { file_path: "/work/a.ts" })]),
      message("assistant", "third reply"),
    ];
    const pane = await paneWithAgents($);
    await pane.press({ key: "agent-scout" });

    const text = await textsOf(pane);
    expect(labelsOf(text)).toEqual(["Main-Agent", "Explore"]);
    expect(text).toContain("first reply");
    expect(text).toContain("third reply");
  });

  test("A7 messages of one role split by the other role stay separate blocks", async ($, on) => {
    worldOf(on);
    transcript = [
      message("user", "task one"),
      message("assistant", "answer one"),
      message("user", "task two"),
      message("assistant", "answer two"),
    ];
    const pane = await paneWithAgents($);
    await pane.press({ key: "agent-scout" });

    expect(labelsOf(await textsOf(pane))).toEqual([
      "Main-Agent",
      "Explore",
      "Main-Agent",
      "Explore",
    ]);
  });

  test("A8 a message with no text and no tool uses draws nothing, not even a label", async ($, on) => {
    worldOf(on);
    transcript = [
      message("assistant", "before"),
      message("user", ""),
      message("assistant", "after"),
    ];
    const pane = await paneWithAgents($);
    await pane.press({ key: "agent-scout" });

    const text = await textsOf(pane);
    expect(labelsOf(text)).toEqual(["Explore"]);
    expect(text).toContain("before");
    expect(text).toContain("after");
  });

  test("A9 a tool row names the tool and its target, a long command only by its first line", async ($, on) => {
    worldOf(on);
    transcript = [
      message("assistant", "looking", [
        use("t1", "Read", { file_path: "/work/src/a.ts" }),
        use("t2", "Bash", { command: "npm test\nsecond line" }),
      ]),
    ];
    const pane = await paneWithAgents($);
    await pane.press({ key: "agent-scout" });

    const text = await textsOf(pane);
    expect(text).toContain("src/a.ts");
    expect(text).not.toContain("/work/src/a.ts");
    expect(text).toContain("npm test");
    expect(text).not.toContain("second line");
    expect(await toolRowKeys(pane)).toEqual(["tool-t1", "tool-t2"]);
  });

  test("A10 pressing a tool row opens the call's detail from the call store, and back returns to the transcript", async ($, on) => {
    worldOf(on);
    transcript = [
      message("assistant", "looking", [use("t1", "Read", { file_path: "/work/a.ts" })]),
    ];
    store.set("calls", { value: [recorded("t1")], version: 1 });
    const pane = await paneWithAgents($);
    await pane.press({ key: "agent-scout" });

    await pane.press({ key: "tool-t1" });

    const detail = await textsOf(pane);
    expect(detail).toContain("Input");
    expect(detail).toContain("recorded input");
    expect(detail).toContain("recorded output");
    expect(detail).not.toContain("looking");

    await pane.press({ key: "back" });
    expect(await textsOf(pane)).toContain("looking");
  });

  test("A11 a call missing from the call store opens the detail from the transcript's own input and text", async ($, on) => {
    worldOf(on);
    transcript = [
      message("assistant", "looking", [
        { ...use("t9", "Read", { file_path: "/work/a.ts" }), text: "transcript output" },
      ]),
    ];
    const pane = await paneWithAgents($);
    await pane.press({ key: "agent-scout" });

    await pane.press({ key: "tool-t9" });

    const detail = await textsOf(pane);
    expect(detail).toContain("/work/a.ts");
    expect(detail).toContain("transcript output");
    expect(detail).not.toContain("looking");
  });

  test("A16 a call opened from the transcript shows the duration the engine reported", async ($, on) => {
    worldOf(on);
    transcript = [
      message("assistant", "looking", [
        { ...use("t9", "Agent", { description: "dig" }), durationMs: 4_200 },
      ]),
    ];
    const pane = await paneWithAgents($);
    await pane.press({ key: "agent-scout" });

    await pane.press({ key: "tool-t9" });

    expect(await textsOf(pane)).toContain("4s");
  });

  test("A17 a call opened from the transcript without a reported duration draws none", async ($, on) => {
    worldOf(on);
    transcript = [
      message("assistant", "looking", [use("t9", "Read", { file_path: "/work/a.ts" })]),
    ];
    const pane = await paneWithAgents($);
    await pane.press({ key: "agent-scout" });

    await pane.press({ key: "tool-t9" });

    const detail = await textsOf(pane);
    expect(detail).toContain("Input");
    expect(detail).not.toContain("0ms");
    expect(detail).not.toContain("-1ms");
  });

  test("A12 a subagent with neither name nor type is labelled Sub-Agent", async ($, on) => {
    worldOf(on);
    const bare = { ...node("scout", "scout the repo", "running"), type: "" };
    const pane = await paneWithAgents($, [bare]);
    await pane.press({ key: "agent-scout" });

    expect(labelsOf(await textsOf(pane))).toEqual(["Main-Agent", "Sub-Agent"]);
  });
});

function worldOf(on: On) {
  store.clear();
  requestedAgents = [];
  writtenKeys = [];
  written.clear();
  transcript = [message("user", "audit the parser"), message("assistant", "found two bugs")];
  const clock = mock.clock(on, { now: NOW });
  on("state.get", (_$, e, next) => {
    const seeded = store.get(e.key);
    return seeded ? { value: seeded } : next(e);
  });
  on("store.get", () => ({ value: undefined }));
  on("session.id", () => ({ value: "session-1" }));
  on("store.set", () => ({ value: undefined }));
  on("state.set", (_$, e, next) => {
    writtenKeys.push(e.key);
    written.set(e.key, e.value);
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
  listedStatus = "running";
  on("agent.list", () => ({
    value: [
      { id: "scout", type: "Explore", description: "scout the repo", status: listedStatus },
    ] as unknown as AgentInfo[],
  }));
  on("session.messages", (_$, e) => {
    requestedAgents.push(e.agentId);
    return { value: transcript };
  });
  return clock;
}

function message(
  role: "user" | "assistant",
  text: string,
  toolUses: ToolUseSummary[] = [],
): SessionMessage {
  return { role, text, toolUses };
}

function use(id: string, tool: string, input: Record<string, unknown>): ToolUseSummary {
  return { tool_use_id: id, tool, input };
}

function recorded(id: string): CallRecord {
  return {
    id,
    tool: "Read",
    target: "/work/a.ts",
    ms: 5,
    isErrored: false,
    added: 0,
    removed: 0,
    input: "recorded input",
    output: "recorded output",
  };
}

function labelsOf(text: string): string[] {
  const lines = text.split("\n");
  return lines.filter((_, i) => lines[i - 1] === "▌ ");
}

function node(id: string, description: string, status: AgentNode["status"]): AgentNode {
  return {
    id,
    type: "Explore",
    description,
    background: false,
    model: "sonnet",
    status,
    startedAt: NOW - 10_000,
    ctxTokens: 0,
    tokensIn: 0,
    tokensOut: 0,
    running: [],
  };
}

async function paneWithAgents(
  $: Engine,
  agents: AgentNode[] = [
    node("scout", "scout the repo", "running"),
    node("other", "other agent", "done"),
  ],
): Promise<Pane> {
  store.set("agents", {
    value: Object.fromEntries(agents.map((one) => [one.id, one])),
    version: 1,
  });
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
      scroll: { offset: 0, bodyRows: ROWS },
      view: {},
    },
    viewport: { columns: COLUMNS, rows: ROWS },
  });
  const tab = (await pane.findAll({ type: "Button" })).find(
    (button) => button.props.label === "Agents",
  );
  if (tab?.key) await pane.press({ key: tab.key });
  return pane;
}

async function toolRowKeys(pane: Pane): Promise<string[]> {
  return (await pane.findAll({ type: "Button" }))
    .map((button) => String(button.key))
    .filter((key) => key.startsWith("tool-"));
}

async function textsOf(pane: Pane): Promise<string> {
  return collected((await pane.drawn()) as unknown as Node);
}

function collected(node: Node): string {
  const own =
    node.type === "Button"
      ? [node.props?.label ?? ""]
      : [node.props?.text, node.props?.source].filter((text) => text !== undefined);
  const children = (node.children ?? []).map((child) =>
    typeof child === "string" ? child : collected(child as Node),
  );
  return [...own, ...children].join("\n");
}
