import { describe, expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";
import type { Engine, Mounted } from "claude-code/testing";

type Pane = Mounted<"terminal", "Pane">;
type Node = { type: string; props?: Record<string, unknown>; children?: unknown[] };
type Line = { text: string; outerTexts: Node[]; hasButton: boolean };
type CallSpec = { tool: string } & Record<string, unknown>;

const NARROW_COLUMNS = 30;
const WIDE_COLUMNS = 100;
const LONG_COMMAND = `echo ${"x".repeat(200)}`;
const BASH_OUTPUT = "first output line\nsecond output line";
const KEPT = 50;
const MANY = 60;

describe("Activity rows", () => {
  for (const columns of [NARROW_COLUMNS, WIDE_COLUMNS]) {
    test(`A1 at ${columns} columns every row is one row, even a 200-character command and a failed call`, async ($, on) => {
      worldOf(on);
      await runMixedCalls($);

      const pane = await mountPane($, columns);

      const lines = await bodyLines(pane);
      const unwrapped = lines
        .flatMap((line) => line.outerTexts)
        .filter((text) => !String(text.props?.wrap).startsWith("truncate"));
      expect(lines.some((line) => line.text.includes("Bash"))).toBe(true);
      expect(unwrapped.map(textOf)).toEqual([]);
      expect(lines.filter((line) => line.text.includes("\n"))).toEqual([]);
    });
  }

  test("A2 the tool-mix legend counts Search, Edit and Agent calls", async ($, on) => {
    worldOf(on);
    await runMixedCalls($);

    const pane = await mountPane($, WIDE_COLUMNS);

    const lines = await bodyLines(pane);
    for (const group of ["Search 1", "Edit 1", "Agent 1"])
      expect(lines.some((line) => line.text.includes(group))).toBe(true);
    const bar = (await pane.findAll({ type: "Text" })).filter((text) =>
      textOf(text as unknown as Node).includes("█"),
    );
    expect(bar.length).toBeGreaterThanOrEqual(4);
  });

  test("A3 no pane text is drawn in the default color", async ($, on) => {
    worldOf(on);
    await runMixedCalls($);

    const pane = await mountPane($, WIDE_COLUMNS);

    const plain = (await pane.findAll({ type: "Text" })).filter(
      (text) => text.props.color === undefined && ownText(text as unknown as Node) !== "",
    );
    expect(plain.map((text) => ownText(text as unknown as Node))).toEqual([]);
  });

  test("A6 sixty calls keep only the last fifty", async ($, on) => {
    worldOf(on);
    for (let i = 0; i < MANY; i++)
      await $.tool.call({
        tool: "Read",
        file_path: `/work/file${i}.ts`,
        tool_use_id: `read-${i}`,
      } as never);

    expect(callsKept).toBe(KEPT);
  });
});

let callsKept = 0;

function worldOf(on: On): void {
  callsKept = 0;
  mock.clock(on);
  on("state.set", (_$, e, next) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (e.plugin === "vane" && e.key === "calls") callsKept = (e.value as unknown[]).length;
    return next(e);
  });
  on("classic.SessionStart", () => ({}));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("session.usage", () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }));
  on("session.model", () => ({ value: "opus" }));
  on("session.cwd", () => ({ value: "/work" }));
  on("agent.list", () => ({ value: [] }));
  on("tool.call", (_$, e) => {
    const call = e as unknown as CallSpec;
    if (call.tool === "Bash" && call.command === "fail")
      return { isError: true, result: "boom", text: "boom" } as never;
    if (call.tool === "Edit")
      return { result: { structuredPatch: [{ lines: ["+a", "-b"] }] }, text: "edited" };
    return { result: BASH_OUTPUT, text: BASH_OUTPUT };
  });
}

async function runMixedCalls($: Engine): Promise<void> {
  const calls: CallSpec[] = [
    { tool: "Bash", command: LONG_COMMAND },
    { tool: "Grep", pattern: "needle" },
    { tool: "Edit", file_path: "/work/src/deep/nested/file.ts" },
    { tool: "Agent", description: "explore the repository", prompt: "look around" },
    { tool: "Bash", command: "fail" },
    { tool: "Bash", command: "fail" },
  ];
  for (const [i, call] of calls.entries())
    await $.tool.call({ ...call, tool_use_id: `mixed-${i}` } as never);
}

function mountPane($: Engine, columns: number): Promise<Pane> {
  return $.ui.mount({
    plugin: "vane",
    surface: "terminal",
    component: "Pane",
    requestId: "session",
    props: {
      title: "Session",
      isFocused: false,
      bodyColumns: columns,
      placement: "dock",
      scroll: { offset: 0, bodyRows: 80 },
      view: {},
    },
    viewport: { columns, rows: 80 },
  });
}

async function bodyLines(pane: Pane): Promise<Line[]> {
  return linesOf((await pane.drawn()) as unknown as Node).filter((line) => line.text !== "");
}

function linesOf(node: Node): Line[] {
  if (node.type === "Text") return [lineOf(node)];
  if (isRow(node) && !holdsColumn(node)) return [lineOf(node)];
  return elementsIn(node).flatMap(linesOf);
}

function lineOf(node: Node): Line {
  return { text: textOf(node), outerTexts: outerTextsIn(node), hasButton: holds(node, "Button") };
}

function isRow(node: Node): boolean {
  return (
    node.type === "Box" && !["column", "column-reverse"].includes(String(node.props?.flexDirection))
  );
}

function holdsColumn(node: Node): boolean {
  return elementsIn(node).some(
    (child) => (child.type === "Box" && !isRow(child)) || holdsColumn(child),
  );
}

function holds(node: Node, type: string): boolean {
  return node.type === type || elementsIn(node).some((child) => holds(child, type));
}

function outerTextsIn(node: Node): Node[] {
  return node.type === "Text" ? [node] : elementsIn(node).flatMap(outerTextsIn);
}

function elementsIn(node: Node): Node[] {
  return (node.children ?? []).filter(
    (child): child is Node => typeof child === "object" && child !== null,
  );
}

function textOf(node: Node): string {
  return (node.children ?? [])
    .map((child) => (typeof child === "string" ? child : textOf(child as Node)))
    .join("");
}

function ownText(node: Node): string {
  return (node.children ?? [])
    .filter((child): child is string => typeof child === "string")
    .join("");
}
