import { describe, expect, test } from "claude-code/testing";

import {
  FAILING_COMMAND,
  buttonKeys,
  buttonLabels,
  mountPane,
  paneOnTab,
  pressButton,
  rowWith,
  runTool,
  screenOf,
  spawnAgent,
  worldOf,
} from "./pane-world";
import type { Pane } from "./pane-world";

const CONTROL_CHARACTER = /\p{Cc}/u;
const BELL = String.fromCharCode(7);
const ESCAPE = String.fromCharCode(27);

describe("control characters in what a tool call names", () => {
  test("T1 a failed command holding control characters shows as one clean row in the Now block", async ($, on) => {
    const world = worldOf(on);
    await runTool($, world, {
      tool: "Bash",
      command: `${FAILING_COMMAND} ${BELL}ring${ESCAPE}[31m red\nsecond line`,
    });

    const pane = await mountPane($);

    const rows = await screenOf(pane);
    expect(rowWith(rows, `${FAILING_COMMAND} ring[31m red`)).toBeDefined();
    expect(rowWith(rows, "second line")).toBeUndefined();
    await expectDrawnWithoutControlCharacters(pane);
  });

  test("T2 the running command shown in the Now block is the first line, clean", async ($, on) => {
    const world = worldOf(on);
    let release: () => void = () => undefined;
    world.holdTools = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = runTool($, world, { tool: "Bash", command: `sleep ${BELL}9\nsecond line` });
    await world.clock.advance(1);

    const pane = await mountPane($);

    const rows = await screenOf(pane);
    expect(rowWith(rows, "sleep 9")).toBeDefined();
    expect(rowWith(rows, "second line")).toBeUndefined();
    await expectDrawnWithoutControlCharacters(pane);
    release();
    await running;
  });

  test("T3 a subagent description holding control characters is a clean button label", async ($, on) => {
    const world = worldOf(on);
    await spawnAgent($, world, `scan${BELL} repo\nmore`);

    const pane = await paneOnTab($, "Agents");

    expect(await buttonLabels(pane)).toContain("scan repo");
    await expectDrawnWithoutControlCharacters(pane);
  });

  test("T4 an MCP server name holding control characters is a clean button", async ($, on) => {
    worldOf(on, {
      mcpTools: [{ name: "mcp__bad__a", serverName: `bad${BELL}name`, tokens: 1, isLoaded: true }],
    });
    const pane = await paneOnTab($, "Setup");
    await pressButton(pane, "mcps-toggle");

    expect(await buttonKeys(pane)).toContain("badname");
    await expectDrawnWithoutControlCharacters(pane);
  });
});

async function expectDrawnWithoutControlCharacters(pane: Pane): Promise<void> {
  expect(JSON.stringify(await pane.drawn())).not.toMatch(CONTROL_CHARACTER);
}
