import { describe, expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";

const SESSION_START = { cwd: "/work", surface: "terminal", isInteractive: true } as const;
const FAILURE_PREFIX = "vane: could not open the pane: ";
const OPEN_ERROR = "pane host is gone";

type World = { failOpen: boolean; logs: string[]; panes: { id: string }[]; closed: string[] };

describe("session command", () => {
  test("C1 a failing pane open answers with the error text instead of falling through", async ($, on) => {
    const world = worldOf(on);
    await $.session.start(SESSION_START);
    world.failOpen = true;

    const result = await run($);

    expect(result).toMatchObject({ text: expect.stringContaining(FAILURE_PREFIX) });
    expect(world.logs.some((line) => line.includes(FAILURE_PREFIX))).toBe(true);
  });

  test("C2 a working pane open answers with no text", async ($, on) => {
    const world = worldOf(on);
    await $.session.start(SESSION_START);

    const result = await run($);

    expect(result.text).toBeUndefined();
    expect(world.logs).toEqual([]);
  });

  test("C3 running it while the pane is open closes the pane instead of opening it again", async ($, on) => {
    const world = worldOf(on);
    await $.session.start(SESSION_START);
    world.panes = [{ id: "session" }];

    await run($);

    expect(world.closed).toEqual(["session"]);
  });
});

function run($: Engine) {
  return $.command.run({
    command: "session",
    args: "",
    origin: { kind: "composer" },
    presentation: { isFullscreen: false, columns: 100 },
  });
}

function worldOf(on: On): World {
  mock.clock(on);
  mock.env(on, { HOME: "/home" });
  const world: World = { failOpen: false, logs: [], panes: [], closed: [] };
  on("session.model", () => ({ value: "claude-opus-5-5" }));
  on("session.cwd", () => ({ value: "/work" }));
  on("session.usage", () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }));
  on("session.measure", (_$, e) => ({ changed: e.changed }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("ui.open", () => {
    if (world.failOpen) throw new Error(OPEN_ERROR);
    return { value: { isPlaced: true } };
  });
  on("ui.panes", () => ({ value: world.panes }) as never);
  on("ui.close", (_$, e) => {
    world.closed.push(e.id);
    return { value: undefined };
  });
  on("ui.log", (_$, e) => {
    world.logs.push(e.text);
    return { value: undefined };
  });
  on("command.register", () => ({ value: {} }) as never);
  on("agent.list", () => ({ value: [] }));
  on("classic.SessionStart", () => ({}));
  on("process.run", () => ({ value: { exitCode: 1, stdout: "", stderr: "" } }) as never);
  return world;
}
