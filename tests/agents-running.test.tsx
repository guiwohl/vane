import { describe, expect, test } from "claude-code/testing";

import {
  finishAgent,
  paneOnTab,
  rowWith,
  screenOf,
  settle,
  spawnAgent,
  spendTokens,
  worldOf,
} from "./pane-world";
import type { Pane, World } from "./pane-world";
import type { Engine } from "claude-code/testing";

const SPENDERS = 7;
const SPEND_ROWS = 6;
const TOKENS_STEP = 1_000;
const SECOND = 1_000;
const NESTING_CELLS = 2;

describe("agents tab", () => {
  test("R1 the main row shows the main model", async ($, on) => {
    worldOf(on);

    const pane = await paneOnTab($, "Agents");

    expect(rowWith(await screenOf(pane), "main")).toContain("opus");
  });

  test("R2 with no agent running the tab says so", async ($, on) => {
    worldOf(on);

    const pane = await paneOnTab($, "Agents");

    expect(rowWith(await screenOf(pane), "no agents running")).toBeDefined();
  });

  test("R3 a running agent is listed as a pressable row and a finished one is not", async ($, on) => {
    const world = worldOf(on);
    const running = await spawnAgent($, world, "still working");
    const finished = await spawnAgent($, world, "all done");
    await finishAgent($, world, finished);

    const pane = await paneOnTab($, "Agents");

    const keys = (await pane.findAll({ type: "Button" })).map((button) => String(button.key));
    expect(keys).toContain(`agent-${running}`);
    expect(keys).not.toContain(`agent-${finished}`);
    expect(rowWith(await screenOf(pane), "all done")).toBeUndefined();
  });

  test("R4 an agent that finishes while the tab is open leaves the list", async ($, on) => {
    const world = worldOf(on);
    const id = await spawnAgent($, world, "short job");
    const pane = await paneOnTab($, "Agents");
    expect(rowWith(await screenOf(pane), "short job")).toBeDefined();

    await finishAgent($, world, id);
    await settle(pane);

    expect(rowWith(await screenOf(pane), "short job")).toBeUndefined();
    expect(rowWith(await screenOf(pane), "no agents running")).toBeDefined();
  });

  test("R5 a running agent's card names its type and model", async ($, on) => {
    const world = worldOf(on);
    await spawnAgent($, world, "scan the repo");

    const pane = await paneOnTab($, "Agents");

    const rows = await screenOf(pane);
    expect(rowWith(rows, "general-purpose")).toContain("sonnet");
  });

  test("R6 a child agent's title starts further right than its parent's", async ($, on) => {
    const world = worldOf(on);
    const parent = await spawnAgent($, world, "parent job");
    await $.agent.spawn({
      tool_use_id: "spawn-child",
      prompt: "x",
      description: "child job",
      subagentType: "general-purpose",
      provider: "anthropic",
      parentModel: "sonnet",
      background: false,
      fork: false,
      parentAgentId: parent,
    } as never);
    await world.clock.advance(SECOND);

    const pane = await paneOnTab($, "Agents");

    const rows = await screenOf(pane);
    const parentAt = rowWith(rows, "parent job")?.indexOf("parent job") ?? -1;
    const childAt = rowWith(rows, "child job")?.indexOf("child job") ?? -1;
    expect(parentAt).toBeGreaterThan(0);
    expect(childAt - parentAt).toBe(NESTING_CELLS);
  });

  test("R7 the run time of a running agent counts up while nothing else happens", async ($, on) => {
    const world = worldOf(on);
    await spawnAgent($, world, "long job");
    const pane = await paneOnTab($, "Agents");
    const before = await runTimeRow(pane);

    await world.clock.advance(5 * SECOND);
    await settle(pane);

    expect(await runTimeRow(pane)).not.toEqual(before);
  });

  test("R8 Spend lists at most six agents, the biggest spender first", async ($, on) => {
    const world = worldOf(on);
    const ids = await spawnMany($, world, SPENDERS);
    for (const [i, id] of ids.entries()) await spendTokens($, world, id, (i + 1) * TOKENS_STEP);

    const pane = await paneOnTab($, "Agents");

    const rows = await spendRows(pane);
    expect(rows).toHaveLength(SPEND_ROWS);
    expect(rows[0]).toContain(`agent ${SPENDERS}`);
    expect(rows.join("\n")).not.toContain("agent 1 ");
  });
});

async function runTimeRow(pane: Pane): Promise<string | undefined> {
  const rows = await screenOf(pane);
  return rows[rows.findIndex((row) => row.includes("general-purpose")) + 1];
}

async function spawnMany($: Engine, world: World, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) ids.push(await spawnAgent($, world, `agent ${i}`));
  return ids;
}

async function spendRows(pane: Pane): Promise<string[]> {
  const rows = await screenOf(pane);
  const at = rows.findIndex((row) => row.startsWith("Spend") || row.trim().startsWith("Spend"));
  return rows
    .slice(at + 1)
    .filter((row) => row.trim() !== "")
    .map((row) => `${row} `);
}
