import { describe, expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";
import type { Engine, Mounted } from "claude-code/testing";

type Pane = Mounted<"terminal", "Pane">;
type Node = { type: string; props?: Record<string, unknown>; children?: unknown };
type Bar = { tabs: string[]; selected: string; arrows: string[] };

const NOW = 200_000;
const NARROW_COLUMNS = 30;
const WIDE_COLUMNS = 80;
const PANE_ROWS = 40;
const ACTIVE_TAB_TEXT = "clawd_background";
const LEFT_ARROW = "‹";
const RIGHT_ARROW = "›";
const ALL_TABS = ["Overview", "Agents", "Context", "Setup", "Spend"];
const FIRST_PAGE = ["Overview", "Agents"];
const SECOND_PAGE = ["Context", "Setup", "Spend"];

describe("tab bar paging", () => {
  test("P1 a narrow pane opens on Overview with Agents beside it and only a right arrow", async ($, on) => {
    worldOf(on);

    const pane = await mountPane($, NARROW_COLUMNS);

    expect(await barOf(pane)).toEqual({
      tabs: FIRST_PAGE,
      selected: "Overview",
      arrows: [RIGHT_ARROW],
    });
  });

  test("P2 pressing the right arrow shows only tabs that were hidden and selects the first of them", async ($, on) => {
    worldOf(on);
    const pane = await mountPane($, NARROW_COLUMNS);
    const before = await barOf(pane);

    await press(pane, RIGHT_ARROW);

    const after = await barOf(pane);
    expect(after).toEqual({
      tabs: SECOND_PAGE,
      selected: "Context",
      arrows: [LEFT_ARROW],
    });
    expect(after.tabs.filter((name) => before.tabs.includes(name))).toEqual([]);
  });

  test("P3 pressing the left arrow on the second page brings the first page back with Overview selected", async ($, on) => {
    worldOf(on);
    const pane = await mountPane($, NARROW_COLUMNS);
    await press(pane, RIGHT_ARROW);

    await press(pane, LEFT_ARROW);

    expect(await barOf(pane)).toEqual({
      tabs: FIRST_PAGE,
      selected: "Overview",
      arrows: [RIGHT_ARROW],
    });
  });

  test("P6 a wide pane shows all five tabs with Overview selected and no arrows", async ($, on) => {
    worldOf(on);

    const pane = await mountPane($, WIDE_COLUMNS);

    expect(await barOf(pane)).toEqual({ tabs: ALL_TABS, selected: "Overview", arrows: [] });
  });

  test("P7 after clicking Agents the right arrow shows the hidden tabs and selects Context", async ($, on) => {
    worldOf(on);
    const pane = await mountPane($, NARROW_COLUMNS);
    await press(pane, "Agents");

    await press(pane, RIGHT_ARROW);

    expect(await barOf(pane)).toEqual({
      tabs: SECOND_PAGE,
      selected: "Context",
      arrows: [LEFT_ARROW],
    });
  });

  test("P9 clicking Agents in a narrow pane selects it and keeps it in the bar", async ($, on) => {
    worldOf(on);
    const pane = await mountPane($, NARROW_COLUMNS);

    await press(pane, "Agents");

    const bar = await barOf(pane);
    expect(bar.selected).toBe("Agents");
    expect(bar.tabs).toContain("Agents");
  });

  test("P10 clicking a tab in a wide pane selects it and the bar still shows all five tabs with no arrows", async ($, on) => {
    worldOf(on);
    const pane = await mountPane($, WIDE_COLUMNS);

    await press(pane, "Spend");

    expect(await barOf(pane)).toEqual({ tabs: ALL_TABS, selected: "Spend", arrows: [] });
  });
});

function worldOf(on: On): void {
  mock.clock(on, { now: NOW });
  mock.env(on, { HOME: "/h/u" });
  on("classic.SessionStart", () => ({}));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("session.usage", () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }));
  on("session.measure", (_$, e) => ({ changed: e.changed }));
  on("session.model", () => ({ value: "opus" }));
  on("session.cwd", () => ({ value: "/work" }));
  on("agent.list", () => ({ value: [] }));
  on("ui.render", { component: "Pane" }, ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>engine pane</Text>;
  });
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
      scroll: { offset: 0, bodyRows: PANE_ROWS },
      view: {},
    },
    viewport: { columns, rows: PANE_ROWS },
  });
}

async function press(pane: Pane, label: string): Promise<void> {
  const button = (await pane.findAll({ type: "Button" })).find(
    (found) => found.props.label === label,
  );
  expect(button, `the tab bar has a ${label} button`).toBeDefined();
  await pane.press({ key: button?.key ?? "" });
}

async function barOf(pane: Pane): Promise<Bar> {
  const row = barRow(await pane.drawn());
  expect(row, "the tab bar row").toBeDefined();
  const items = childrenOf(row as Node);
  const arrows = items
    .filter((item) => item.type === "Button")
    .map((item) => String(item.props?.label));
  const tabs = items.filter((item) => item.type === "Box");
  return {
    tabs: tabs.map(tabName),
    selected: tabName(tabs.find(isSelectedTab) as Node),
    arrows,
  };
}

function barRow(node: Node): Node | undefined {
  const isRow = node.type === "Box" && node.props?.height === 1 && node.props.overflow === "hidden";
  if (isRow) return node;
  return childrenOf(node)
    .map(barRow)
    .find((found) => found !== undefined);
}

function isSelectedTab(tab: Node): boolean {
  return childrenOf(tab).some(
    (part) => part.props?.bold === true && part.props.color === ACTIVE_TAB_TEXT,
  );
}

function tabName(tab: Node): string {
  return childrenOf(tab)
    .map((part) => (part.type === "Button" ? String(part.props?.label) : textOf(part)))
    .join("")
    .trim();
}

function childrenOf(node: Node): Node[] {
  const raw = node.children;
  const list = Array.isArray(raw) ? raw.flat(Infinity) : raw === undefined ? [] : [raw];
  return list.filter((child): child is Node => typeof child === "object" && child !== null);
}

function textOf(node: Node): string {
  const raw = node.children;
  const list = Array.isArray(raw) ? raw.flat(Infinity) : raw === undefined ? [] : [raw];
  return list
    .map((child) => (typeof child === "object" ? textOf(child as Node) : String(child)))
    .join("");
}
