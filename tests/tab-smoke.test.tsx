import { describe, expect, test } from "claude-code/testing";

import {
  FAILING_COMMAND,
  SIZES,
  mountPane,
  openTab,
  rowWith,
  runTool,
  screenOf,
  spawnAgent,
  worldOf,
} from "./pane-world";
import type { Engine } from "claude-code/testing";
import type { Size } from "./pane-world";

const TABS = [
  { label: "Overview", landmark: "Gauges" },
  { label: "Agents", landmark: "main" },
  { label: "Context", landmark: "context" },
  { label: "Spend", landmark: "Where it went" },
];

describe("every tab draws", () => {
  for (const { label, landmark } of TABS) {
    for (const [sizeName, size] of SIZES) {
      test(`S1 the ${label} tab draws its content in a ${sizeName} pane and stays inside the width`, async ($, on) => {
        const world = worldOf(on);
        await runTool($, world, { tool: "Read", file_path: "/work/a.ts" });
        await runTool($, world, { tool: "Bash", command: FAILING_COMMAND });
        await spawnAgent($, world, "scan the repo");
        const pane = await shownTab($, label, size);

        const rows = await screenOf(pane, size);

        expect(rowWith(rows, landmark), `a row with ${landmark}`).toBeDefined();
        expect(rows.filter((row) => row.length > size.columns)).toEqual([]);
        expect(boxWidths(await pane.drawn()).filter((width) => width > size.columns)).toEqual([]);
      });
    }
  }
});

async function shownTab($: Engine, label: string, size: Size) {
  const first = await mountPane($);
  if (label !== "Overview") await openTab(first, label);
  await first.unmount();
  return mountPane($, size);
}

function boxWidths(node: unknown): number[] {
  if (Array.isArray(node)) return node.flatMap(boxWidths);
  if (typeof node !== "object" || node === null) return [];
  const { props, children } = node as { props?: { width?: unknown }; children?: unknown };
  const own = typeof props?.width === "number" ? [props.width] : [];
  return [...own, ...boxWidths(children)];
}
