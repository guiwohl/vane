import { describe, expect, test } from "claude-code/testing";
import type { Engine } from "claude-code/testing";

import {
  FAILING_COMMAND,
  WIDE,
  buttonKeys,
  mountPane,
  pressButton,
  rowWith,
  runTool,
  screenOf,
  worldOf,
} from "./pane-world";

type Spec = { id: string; tool: string; input: Record<string, unknown> };

describe("call detail overlay", () => {
  test("O1 pressing Details on a tool group replaces the tab body with that call's detail", async ($, on) => {
    const world = worldOf(on);
    const id = await runTool($, world, { tool: "Bash", command: "echo hello" });
    const pane = await mountPane($);
    expect(await buttonKeys(pane)).not.toContain("back");

    await pressDetails($, [{ id, tool: "Bash", input: { command: "echo hello" } }]);
    await pane.redraw();

    expect(await buttonKeys(pane)).toContain("back");
    const rows = await screenOf(pane, WIDE);
    expect(rowWith(rows, "Bash")).toContain("done");
    expect(rowWith(rows, "Gauges")).toBeUndefined();
  });

  test("O2 the back button returns to the tab body", async ($, on) => {
    const world = worldOf(on);
    const id = await runTool($, world, { tool: "Bash", command: "echo hello" });
    const pane = await mountPane($);
    await pressDetails($, [{ id, tool: "Bash", input: { command: "echo hello" } }]);
    await pane.redraw();

    await pressButton(pane, "back");

    expect(await buttonKeys(pane)).not.toContain("back");
    expect(rowWith(await screenOf(pane, WIDE), "Gauges")).toBeDefined();
  });

  test("O3 in a group the failed call is the one that opens", async ($, on) => {
    const world = worldOf(on);
    const failed = await runTool($, world, { tool: "Bash", command: FAILING_COMMAND });
    const fine = await runTool($, world, { tool: "Bash", command: "echo fine" });
    const pane = await mountPane($);

    await pressDetails($, [
      { id: failed, tool: "Bash", input: { command: FAILING_COMMAND } },
      { id: fine, tool: "Bash", input: { command: "echo fine" } },
    ]);
    await pane.redraw();

    expect(rowWith(await screenOf(pane, WIDE), "Bash")).toContain("failed");
  });
});

async function pressDetails($: Engine, calls: Spec[]): Promise<void> {
  const group = await $.ui.mount({
    plugin: "vane",
    surface: "terminal",
    component: "ToolGroup",
    props: {
      calls: calls.map((call) => ({
        tool_use_id: call.id,
        tool: call.tool,
        input: call.input,
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
      })),
      isActive: false,
      isExpanded: false,
    },
    viewport: { columns: WIDE.columns, rows: 24 },
  });
  const details = (await group.findAll({ type: "Button" })).find(
    (button) => button.props.label === "Details",
  );
  expect(details, "a Details button").toBeDefined();
  await group.press({ key: details?.key ?? "" });
}
