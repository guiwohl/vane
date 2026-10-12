import { describe, expect, test } from "claude-code/testing";
import type { AgentInfo } from "claude-code";

import { openTab, paneOnTab, settle, worldOf } from "./pane-world";

const POLL_MS = 1_000;
const POLLS = 3;
const RUNNING = [
  { id: "scout", type: "Explore", description: "scout the repo", status: "running" },
] as unknown as AgentInfo[];

describe("agents polling", () => {
  test("Q1 while the Agents tab is open and an agent runs the engine is asked every second", async ($, on) => {
    const world = worldOf(on);
    world.agentsListed = RUNNING;
    await paneOnTab($, "Agents");
    const afterOpen = world.listCalls;

    await world.clock.advance(POLL_MS * POLLS);

    expect(world.listCalls - afterOpen).toBeGreaterThanOrEqual(POLLS);
  });

  test("Q2 once the Agents tab is left the engine is no longer polled", async ($, on) => {
    const world = worldOf(on);
    world.agentsListed = RUNNING;
    const pane = await paneOnTab($, "Agents");
    await world.clock.advance(POLL_MS);
    await openTab(pane, "Overview");
    await settle(pane);
    await world.clock.advance(POLL_MS);
    const afterLeaving = world.listCalls;

    await world.clock.advance(POLL_MS * POLLS);

    expect(world.listCalls).toBe(afterLeaving);
  });
});
