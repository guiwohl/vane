import { describe, expect, test } from "claude-code/testing";
import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";

import { FAILURE_WINDOW_MS } from "../hooks/live-draw";
import {
  FAILING_COMMAND,
  buttonKeys,
  mountPane,
  pressButton,
  rowWith,
  runTool,
  screenOf,
  settle,
  worldOf,
} from "./pane-world";
import type { World } from "./pane-world";

const NARROW_60 = { columns: 60, rows: 40 };

type Task = { id: string; type: string; status: string; description: string } & Record<
  string,
  string
>;

describe("background work in the Now block", () => {
  test("N1 a shell in flight is a row with its command and the time since it was first seen", async ($, on) => {
    const world = engineWorld(on);
    const pane = await mountPane($, NARROW_60);

    await stop($, [shell("s1", "npm run dev")]);
    await world.clock.advance(65_000);
    await settle(pane);

    const row = rowWith(await screenOf(pane, NARROW_60), "npm run dev");
    expect(row).toContain("shell");
    expect(row).toContain("1m");
  });

  test("N2 a Stop without the list changes nothing, an empty list clears the row", async ($, on) => {
    engineWorld(on);
    const pane = await mountPane($, NARROW_60);
    await stop($, [shell("s1", "npm run dev")]);

    await $.classic.Stop({ stop_hook_active: false });
    await settle(pane);
    expect(rowWith(await screenOf(pane, NARROW_60), "npm run dev")).toBeDefined();

    await stop($, []);
    await settle(pane);
    expect(rowWith(await screenOf(pane, NARROW_60), "npm run dev")).toBeUndefined();
  });

  test("N3 a SubagentStop reconciles the same set", async ($, on) => {
    engineWorld(on);
    const pane = await mountPane($, NARROW_60);

    await $.classic.SubagentStop({
      stop_hook_active: false,
      agent_id: "a1",
      agent_type: "Explore",
      agent_transcript_path: "/t",
      background_tasks: [shell("s1", "tail -f log")],
    });
    await settle(pane);

    expect(rowWith(await screenOf(pane, NARROW_60), "tail -f log")).toBeDefined();
  });

  test("N4 a subagent task is not drawn as a background row", async ($, on) => {
    engineWorld(on);
    const pane = await mountPane($, NARROW_60);

    await stop($, [
      { id: "a1", type: "subagent", status: "running", description: "d", agent_type: "Explore" },
    ]);
    await settle(pane);

    expect(rowWith(await screenOf(pane, NARROW_60), "Explore")).toBeUndefined();
  });

  test("N5 /clear forgets the background work", async ($, on) => {
    engineWorld(on);
    const pane = await mountPane($, NARROW_60);
    await stop($, [shell("s1", "npm run dev")]);

    await $.classic.SessionStart({ source: "clear" });
    await settle(pane);

    expect(rowWith(await screenOf(pane, NARROW_60), "npm run dev")).toBeUndefined();
  });
});

describe("failures in the Now block", () => {
  test("F1 a failure leaves the block once it is older than the window, a newer one stays", async ($, on) => {
    const world = engineWorld(on);
    await runTool($, world, { tool: "Bash", command: `${FAILING_COMMAND} old` });
    await world.clock.advance(FAILURE_WINDOW_MS);
    await runTool($, world, { tool: "Bash", command: `${FAILING_COMMAND} new` });

    const pane = await mountPane($, NARROW_60);

    const rows = await screenOf(pane, NARROW_60);
    expect(rowWith(rows, `${FAILING_COMMAND} new`)).toBeDefined();
    expect(rowWith(rows, `${FAILING_COMMAND} old`)).toBeUndefined();
  });

  test("F2 pressing a failure row opens that call's detail", async ($, on) => {
    const world = engineWorld(on);
    const id = await runTool($, world, { tool: "Bash", command: FAILING_COMMAND });
    const pane = await mountPane($, NARROW_60);
    expect(await buttonKeys(pane)).not.toContain("back");

    await pressButton(pane, `live-${id}`);

    expect(await buttonKeys(pane)).toContain("back");
    expect(rowWith(await screenOf(pane, NARROW_60), "failed")).toBeDefined();
  });

  test("F3 pressing a running tool row opens its detail while it runs", async ($, on) => {
    const world = engineWorld(on);
    const release = hold(world);
    world.mainMessages = [
      {
        role: "assistant",
        text: "",
        toolUses: [{ tool_use_id: "call-1", tool: "Bash", input: { command: "sleep 9" } }],
      },
    ];
    const running = runTool($, world, { tool: "Bash", command: "sleep 9" });
    await world.clock.advance(1);
    const pane = await mountPane($, NARROW_60);

    await pressButton(pane, "live-call-1");

    expect(await buttonKeys(pane)).toContain("back");
    release();
    await running;
  });

  test("F5 pressing a running row the engine does not list opens nothing and sets no openCall", async ($, on) => {
    const world = engineWorld(on);
    const writes: string[] = [];
    on("state.set", (_$, e, next) => {
      if (e.key.includes("openCall")) writes.push(e.key);
      return next(e);
    });
    const release = hold(world);
    const running = runTool($, world, { tool: "Bash", command: "sleep 9" });
    await world.clock.advance(1);
    const pane = await mountPane($, NARROW_60);

    await pressButton(pane, "live-call-1");

    expect(writes).toEqual([]);
    expect(await buttonKeys(pane)).not.toContain("back");
    release();
    await running;
  });

  test("F4 pressable rows keep the time column where an unpressable row has it", async ($, on) => {
    const world = engineWorld(on);
    await runTool($, world, { tool: "Bash", command: FAILING_COMMAND });
    const pane = await mountPane($, NARROW_60);
    await stop($, [shell("s1", "npm run dev")]);
    await settle(pane);

    const rows = await screenOf(pane, NARROW_60);

    const ends = [rowWith(rows, "✗"), rowWith(rows, "npm run dev")].map((row) => row?.length);
    expect(ends[0]).toBeDefined();
    expect(ends[0]).toBe(ends[1]);
  });
});

type Logged = { to: string; text: string };

function engineWorld(on: On, logged: Logged[] = []): World {
  const world = worldOf(on);
  on("classic.Stop", () => ({}));
  on("classic.SubagentStop", () => ({}));
  on("ui.log", (_$, e) => {
    logged.push({ to: e.to, text: e.text });
    return { value: undefined };
  });
  return world;
}

function shell(id: string, command: string): Task {
  return { id, type: "shell", status: "running", description: command, command };
}

function stop($: Engine, tasks: Task[]): Promise<unknown> {
  return $.classic.Stop({ stop_hook_active: false, background_tasks: tasks });
}

function hold(world: World): () => void {
  let release: () => void = () => undefined;
  world.holdTools = new Promise<void>((resolve) => {
    release = resolve;
  });
  return release;
}
