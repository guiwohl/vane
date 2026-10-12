import { describe, expect, test } from "claude-code/testing";
import type { ContextCategory } from "claude-code";

import { WIDE, openTab, paneOnTab, rowWith, screenOf, settle, worldOf } from "./pane-world";

const FULL_GRID_COLUMNS = 80;
const NARROW_COLUMNS = 50;
const DEFERRED: ContextCategory = {
  name: "MCP tools (deferred)",
  tokens: 30_000,
  color: "success",
  isDeferred: true,
  kind: "deferred",
};
const USED: ContextCategory[] = [
  { name: "Free space", tokens: 166_000, color: "grey", isDeferred: false, kind: "free" },
  { name: "System prompt", tokens: 4_000, color: "cyan", isDeferred: false, kind: "used" },
  { name: "Messages", tokens: 30_000, color: "magenta", isDeferred: false, kind: "used" },
];

describe("context tab", () => {
  test("K1 the header carries the used tokens, the window and the percentage badge", async ($, on) => {
    worldOf(on);

    const pane = await paneOnTab($, "Context");

    const header = rowWith(await screenOf(pane), "◆ context");
    expect(header).toContain("34k of 200k");
    expect(header).toContain("17%");
  });

  test("K2 the legend has one row per category and puts free space last", async ($, on) => {
    worldOf(on, { categories: USED });

    const pane = await paneOnTab($, "Context");

    const rows = await screenOf(pane);
    const at = (name: string) => rows.findIndex((row) => row.includes(name));
    expect(USED.map((category) => at(category.name))).not.toContain(-1);
    expect(at("System prompt")).toBeLessThan(at("Free space"));
    expect(at("Messages")).toBeLessThan(at("Free space"));
  });

  test("K3 a deferred category has no legend row and is counted in one note", async ($, on) => {
    worldOf(on, { categories: [...USED, DEFERRED] });

    const pane = await paneOnTab($, "Context");

    const rows = await screenOf(pane);
    expect(rows.filter((row) => row.includes("MCP tools (deferred)"))).toEqual([]);
    expect(rowWith(rows, "30k deferred")).toBeDefined();
  });

  test("K4 opening the tab asks once with the pane width, a measure while shown asks again and coming back asks fresh", async ($, on) => {
    const world = worldOf(on);
    const pane = await paneOnTab($, "Context");
    const asked = () => world.usageCalls.filter((call) => call.columns !== undefined).length;
    const afterOpen = asked();
    await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ["context"] });
    await settle(pane);
    const afterMeasure = asked();
    await openTab(pane, "Agents");
    await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ["context"] });
    await settle(pane);
    const afterOtherTab = asked();
    await openTab(pane, "Context");

    expect(world.usageCalls.find((call) => call.columns !== undefined)).toEqual({
      breakdown: "full",
      columns: WIDE.columns - 1,
    });
    expect([afterOpen, afterMeasure, afterOtherTab, asked()]).toEqual([1, 2, 2, 3]);
  });

  test("K5 a pane narrower than 80 columns still asks for the full-resolution grid", async ($, on) => {
    const world = worldOf(on);

    await paneOnTab($, "Context", { columns: NARROW_COLUMNS, rows: WIDE.rows });

    expect(world.usageCalls.find((call) => call.columns !== undefined)?.columns).toBe(
      FULL_GRID_COLUMNS,
    );
  });
});
