import { describe, expect, test } from "claude-code/testing";

import {
  FAILING_COMMAND,
  mountPane,
  openTab,
  paneOnTab,
  pressButton,
  rowWith,
  runTool,
  screenOf,
  spawnAgent,
  worldOf,
} from "./pane-world";
import type { Pane } from "./pane-world";

const CLEAR = "clear";

describe("overview clear button", () => {
  test("C1 there is no clear button before the first call, one after it, and none after the press", async ($, on) => {
    const world = worldOf(on);
    const pane = await mountPane($);
    const before = await clearButtons(pane);

    await runTool($, world, { tool: "Read", file_path: "/work/a.ts" });
    await pane.redraw();
    const after = await clearButtons(pane);
    await pressButton(pane, CLEAR);

    expect([before, after, await clearButtons(pane)]).toEqual([0, 1, 0]);
  });

  test("C2 pressing clear empties the tool mix legend", async ($, on) => {
    const world = worldOf(on);
    await runTool($, world, { tool: "Read", file_path: "/work/a.ts" });
    const pane = await mountPane($);
    expect(rowWith(await screenOf(pane), "Read 1")).toBeDefined();

    await pressButton(pane, CLEAR);

    const rows = await screenOf(pane);
    expect(rowWith(rows, "Read 1")).toBeUndefined();
    expect(rowWith(rows, "nothing run yet")).toBeDefined();
  });

  test("C3 a call after the press is the only one the legend counts", async ($, on) => {
    const world = worldOf(on);
    await runTool($, world, { tool: "Read", file_path: "/work/a.ts" });
    await runTool($, world, { tool: "Bash", command: "echo old" });
    const pane = await mountPane($);
    await pressButton(pane, CLEAR);

    await runTool($, world, { tool: "Edit", file_path: "/work/b.ts" });
    await pane.redraw();

    const rows = await screenOf(pane);
    expect(rowWith(rows, "Edit 1")).toBeDefined();
    expect(rowWith(rows, "Read 1")).toBeUndefined();
    expect(rowWith(rows, "Bash 1")).toBeUndefined();
  });

  test("C4 the failure count starts again after the press", async ($, on) => {
    const world = worldOf(on);
    await runTool($, world, { tool: "Bash", command: FAILING_COMMAND });
    const pane = await mountPane($);
    expect(rowWith(await screenOf(pane), "1 failure")).toBeDefined();

    await pressButton(pane, CLEAR);

    expect(rowWith(await screenOf(pane), "0 failures")).toBeDefined();
  });

  test("C5 pressing clear on Overview leaves the running agents on the Agents tab", async ($, on) => {
    const world = worldOf(on);
    await runTool($, world, { tool: "Read", file_path: "/work/a.ts" });
    await spawnAgent($, world, "scan the repo");
    const pane = await paneOnTab($, "Agents");
    const before = await buttonKeysOnScreen(pane);
    await openTab(pane, "Overview");
    await pressButton(pane, CLEAR);

    await openTab(pane, "Agents");

    expect(before.length).toBeGreaterThan(0);
    expect(await buttonKeysOnScreen(pane)).toEqual(before);
  });
});

async function clearButtons(pane: Pane): Promise<number> {
  return (await pane.findAll({ type: "Button" })).filter((button) => button.props.label === CLEAR)
    .length;
}

async function buttonKeysOnScreen(pane: Pane): Promise<string[]> {
  return (await pane.findAll({ type: "Button" }))
    .map((button) => String(button.key))
    .filter((key) => key.startsWith("agent-"));
}
