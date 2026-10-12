import { describe, expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";

import { ENGINE_DEFAULT_GREY, accentOf } from "../hooks/session-color";

type Drawn = { type?: string; props?: Record<string, unknown>; children?: unknown[] };

const TRANSCRIPT = "/home/session.jsonl";
const SESSION_START = { cwd: "/work", surface: "terminal", isInteractive: true } as const;
const RED = accentOf("red");
const BLUE = accentOf("blue");
const DEFAULT_GREY = ENGINE_DEFAULT_GREY;
const TITLE_CHIP_TEXT = "clawd_background";

describe("the pane tab tracks the session colour", () => {
  test("K1b a half-written last entry keeps the previous colour", async ($, on) => {
    const world = worldOf(on, ["red", '{"type":"agent-color","agentCo']);
    await $.session.start(SESSION_START);
    await $.classic.Stop(stop());
    await world.settle();

    expect((await selectedTabPaint($)).background).toBe(RED);
  });

  test("K3 a colour change shows on the tab at the next event", async ($, on) => {
    const world = worldOf(on, ["red"]);
    await $.session.start(SESSION_START);
    await $.classic.Stop(stop());
    await world.settle();

    world.entries.push("blue");
    await $.classic.Stop(stop());
    await world.settle();

    expect((await selectedTabPaint($)).background).toBe(BLUE);
  });

  test("K4 the last colour entry wins and default returns the engine grey", async ($, on) => {
    const world = worldOf(on, ["red", "default"]);
    await $.session.start(SESSION_START);
    await $.classic.Stop(stop());
    await world.settle();

    expect((await selectedTabPaint($)).background).toBe(DEFAULT_GREY);
  });

  test("K7 /color repaints the tab at once, without a prompt or a turn end", async ($, on) => {
    const world = worldOf(on, ["red"]);
    await $.session.start(SESSION_START);
    await $.classic.Stop(stop());
    await world.settle();

    world.entries.push("blue");
    await $.command.run({
      command: "color",
      args: "blue",
      origin: { kind: "composer" },
      presentation: { isFullscreen: false, columns: 100 },
    });
    await world.settle();

    expect((await selectedTabPaint($)).background).toBe(BLUE);
  });
});

describe("the pane tab follows the session colour", () => {
  for (const name of ["red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"]) {
    test(`K8 under /color ${name} the selected tab is that accent with clawd_background text`, async ($, on) => {
      const world = worldOf(on, [name]);
      await $.session.start(SESSION_START);
      await $.classic.Stop(stop());
      await world.settle();

      expect(await selectedTabPaint($)).toEqual({
        background: accentOf(name),
        text: TITLE_CHIP_TEXT,
      });
    });
  }

  test("K9 with no colour the selected tab is the engine default grey with clawd_background text", async ($, on) => {
    const world = worldOf(on, []);
    await $.session.start(SESSION_START);
    await $.classic.Stop(stop());
    await world.settle();

    expect(await selectedTabPaint($)).toEqual({
      background: DEFAULT_GREY,
      text: TITLE_CHIP_TEXT,
    });
  });
});

describe("the side pane", () => {
  test("K6 the Pane root has no backgroundColor", async ($, on) => {
    worldOf(on, []);
    await $.session.start(SESSION_START);
    const pane = await $.ui.mount({
      plugin: "vane",
      surface: "terminal",
      component: "Pane",
      requestId: "session",
      props: {
        title: "Session",
        isFocused: false,
        bodyColumns: 40,
        placement: "dock",
        scroll: { offset: 0, bodyRows: 40 },
        view: {},
      },
      viewport: { columns: 40, rows: 40 },
    });

    expect(((await pane.drawn()) as Drawn).props?.backgroundColor).toBeUndefined();
  });
});

function worldOf(on: On, initial: string[]): { entries: string[]; settle: () => Promise<void> } {
  const clock = mock.clock(on);
  const entries = [...initial];
  mock.env(on, { HOME: "/home" });
  on("session.model", () => ({ value: "claude-opus-5-5" }));
  on("session.cwd", () => ({ value: "/work" }));
  on("session.usage", () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }));
  on("session.measure", (_$, e) => ({ changed: e.changed }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("command.register", () => ({ value: {} }) as never);
  on("agent.list", () => ({ value: [] }));
  on("classic.SessionStart", () => ({}));
  on("classic.UserPromptSubmit", () => ({}));
  on("classic.PostModelSwitch", () => ({}));
  on("classic.CwdChanged", () => ({}));
  on("classic.Stop", () => ({}));
  on("command.run", () => ({}));
  on("classic.PostToolUse", () => ({}));
  on(
    "process.run",
    () =>
      ({
        value: {
          exitCode: entries.length === 0 ? 1 : 0,
          stdout: entries
            .map((agentColor) =>
              agentColor.startsWith("{")
                ? `${agentColor}\n`
                : `{"type":"agent-color","agentColor":"${agentColor}","sessionId":"s"}\n`,
            )
            .join(""),
          stderr: "",
        },
      }) as never,
  );
  return { entries, settle: () => clock.settle() };
}

function stop(): Parameters<Engine["classic"]["Stop"]>[0] {
  return {
    stop_hook_active: false,
    effort: { level: "high" },
    transcript_path: TRANSCRIPT,
  };
}

async function selectedTabPaint($: Engine): Promise<{ background: unknown; text: unknown }> {
  const pane = await $.ui.mount({
    plugin: "vane",
    surface: "terminal",
    component: "Pane",
    requestId: "session",
    props: {
      title: "Session",
      isFocused: false,
      bodyColumns: 60,
      placement: "dock",
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
    viewport: { columns: 60, rows: 40 },
  });
  const [label] = await pane.findAll({ type: "Text", text: "Overview" });
  return { background: label?.props.backgroundColor, text: label?.props.color };
}
