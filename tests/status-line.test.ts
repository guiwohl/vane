import { describe, expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";

import { displayWidth } from "../hooks/text-width";

type Piece = { text: string; color: string | undefined; bold: boolean | undefined };
type Limit = { kind: string; percentUsed: number; resetsInMs?: number };
type WorldOptions = {
  tokens?: number;
  window?: number;
  cwd?: string;
  model?: string;
  limits?: Limit[];
};

const NOW = 1_800_000_000_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const HOME = "/Users/dev";
const PROJECT = `${HOME}/W/Projects/releezy`;
const MODEL = "claude-opus-5-5";
const ENGINE_HINT = "(shift+tab to cycle) · ← for agents";
const ACCENT = "claude";
const MUTED = "inactive";
const PAD = { text: "  ", color: undefined, bold: true };
const PATH_CELLS = 36;
const SESSION_START = { cwd: PROJECT, surface: "terminal", isInteractive: true } as const;

describe("the status line", () => {
  test("SL1 the cycle hint is removed and the rest of the engine hint stays", async ($, on) => {
    await worldOf($, on);

    const drawn = await piecesOf($, "(shift+tab to cycle) · esc to interrupt");

    expect(drawn.at(-1)).toEqual({ text: "esc to interrupt", color: MUTED, bold: undefined });
    expect(drawn.map((piece) => piece.text).join("")).not.toContain("shift+tab");
  });

  test("SL2 each field splits into an accent value and a muted detail, all bold", async ($, on) => {
    await worldOf($, on, {
      tokens: 155_100,
      window: 1_000_000,
      limits: [{ kind: "five_hour", percentUsed: 2, resetsInMs: 3 * HOUR_MS + 5 * MINUTE_MS }],
    });
    await effortStop($, "high");

    expect(await piecesOf($)).toEqual([
      PAD,
      accent("155.1k"),
      muted(" / 1.00M"),
      PAD,
      PAD,
      accent("Opus 5.5 "),
      muted("(high)"),
      PAD,
      PAD,
      accent("2%"),
      muted(" ↻ 3h05m"),
      PAD,
      PAD,
      accent("~/W/Projects/releezy"),
      PAD,
    ]);
  });

  test("SL3 no limits shows a single muted usage —", async ($, on) => {
    await worldOf($, on, { limits: [] });

    const drawn = await piecesOf($);

    expect(drawn.filter((piece) => piece.text === "usage —")).toEqual([muted("usage —")]);
  });

  test("SL4 token counts are humanized at the boundaries", async ($, on) => {
    await worldOf($, on);

    await measureUsage($, { tokens: 999, window: 1_000 });
    expect(await piecesOf($)).toEqual(expect.arrayContaining([accent("999"), muted(" / 1.0k")]));

    await measureUsage($, { tokens: 1_000, window: 999_999 });
    expect(await piecesOf($)).toEqual(
      expect.arrayContaining([accent("1.0k"), muted(" / 1000.0k")]),
    );

    await measureUsage($, { tokens: 1_000_000, window: 1_000_000 });
    expect(await piecesOf($)).toEqual(expect.arrayContaining([accent("1.00M"), muted(" / 1.00M")]));
  });

  test("SL5 a reset shows the largest unit", async ($, on) => {
    await worldOf($, on);
    const resetPiece = async (resetsInMs: number) => {
      await measureUsage($, { limits: [{ kind: "five_hour", percentUsed: 10, resetsInMs }] });
      return piecesOf($);
    };

    expect(await resetPiece(2 * DAY_MS + 3 * HOUR_MS)).toContainEqual(muted(" ↻ 2d3h"));
    expect(await resetPiece(3 * HOUR_MS + 5 * MINUTE_MS)).toContainEqual(muted(" ↻ 3h05m"));
    expect(await resetPiece(45 * MINUTE_MS)).toContainEqual(muted(" ↻ 45m"));
  });

  test("SL6 a long directory is cut to an ellipsis and its last 35 characters", async ($, on) => {
    const tail = "a/very/long/path/that/never/fits/in/the/status/line";
    await worldOf($, on, { cwd: `${HOME}/${tail}` });

    const shown = `~/${tail}`;

    expect(await piecesOf($)).toContainEqual(accent(`…${shown.slice(-35)}`));
  });

  test("SL9 a directory of wide characters is cut by display cells, not by string length", async ($, on) => {
    await worldOf($, on, { cwd: `${HOME}/${"日".repeat(30)}` });

    const shown = pathPiece(await piecesOf($));

    expect(displayWidth(shown)).toBeLessThanOrEqual(PATH_CELLS);
    expect(shown.startsWith("…日")).toBe(true);
  });

  test("SL10 a directory of combining accents is not cut while it fits in the cells", async ($, on) => {
    const decomposed = "e\u0301".repeat(30);
    await worldOf($, on, { cwd: `${HOME}/${decomposed}` });

    expect(pathPiece(await piecesOf($))).toBe(`~/${decomposed}`);
  });

  test("SL11 a dated model name drops the prefix and the date", async ($, on) => {
    await worldOf($, on, { model: "claude-haiku-4-5-20251001" });

    expect(await piecesOf($)).toContainEqual(accent("Haiku 4.5 "));
  });

  test("SL12 a directory that merely starts like home keeps its full path", async ($, on) => {
    await worldOf($, on, { cwd: "/Users/devops/app" });

    expect(await piecesOf($)).toContainEqual(accent("/Users/devops/app"));
  });

  test("SL13 switching the model updates the model shown", async ($, on) => {
    await worldOf($, on);

    await $.classic.PostModelSwitch(modelSwitch(MODEL, "claude-haiku-4-5"));

    expect(await piecesOf($)).toContainEqual(accent("Haiku 4.5 "));
  });

  test("SL14 a subagent stopping does not overwrite the main chat effort", async ($, on) => {
    await worldOf($, on);
    await effortStop($, "high");

    await $.classic.Stop({
      stop_hook_active: false,
      effort: { level: "low" },
      agent_id: "agent-1",
    });

    expect(await piecesOf($)).toContainEqual(muted("(high)"));
  });

  test("SL15 a limit with no reset time shows the percent and no time", async ($, on) => {
    await worldOf($, on, { limits: [{ kind: "five_hour", percentUsed: 48 }] });

    const drawn = await piecesOf($);

    expect(drawn).toContainEqual(accent("48%"));
    expect(drawn.map((piece) => piece.text).join("")).not.toContain("↻");
  });

  test("SL16 a turn ending keeps the measured figures instead of the stale ones", async ($, on) => {
    await worldOf($, on, { tokens: 10_000, window: 200_000 });
    await measureUsage($, { tokens: 42_000, window: 200_000 });

    await $.turn.start({ text: "go", turnId: "t1" });
    await $.turn.complete({
      answer: "",
      durationMs: 1,
      isAborted: false,
      turnId: "t1",
      reason: "answer",
    });

    const text = (await piecesOf($)).map((piece) => piece.text).join("");
    expect(text).toContain("42.0k");
    expect(text).not.toContain("10.0k");
  });

  test("SL7 unknown tokens drop the token part and keep the model and directory", async ($, on) => {
    await worldOf($, on, {});

    expect(await piecesOf($)).toEqual([
      PAD,
      accent("Opus 5.5 "),
      muted("(—)"),
      PAD,
      PAD,
      muted("usage —"),
      PAD,
      PAD,
      accent("~/W/Projects/releezy"),
      PAD,
    ]);
  });

  test("SL8 the for-agents hint is dropped and nothing is left over", async ($, on) => {
    await worldOf($, on);

    const drawn = await piecesOf($, "← for agents");

    expect(drawn.map((piece) => piece.text).join("")).not.toContain("for agents");
    expect(drawn.at(-1)).toEqual(PAD);
  });
});

async function worldOf($: Engine, on: On, options: WorldOptions = {}): Promise<void> {
  mock.clock(on, { now: NOW });
  mock.env(on, { HOME });
  const cwd = options.cwd ?? PROJECT;
  const context =
    options.tokens === undefined || options.window === undefined
      ? {}
      : { tokens: options.tokens, window: options.window };
  const rateLimits = rateLimitsOf(options.limits ?? []);

  on("session.model", () => ({ value: options.model ?? MODEL }));
  on("session.cwd", () => ({ value: cwd }));
  on("session.usage", () => ({ value: { startedAt: 0, context, rateLimits } }) as never);
  on("session.measure", (_$, e) => ({ changed: e.changed }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("turn.start", (_$, e) => ({ turnId: e.turnId }));
  on("turn.complete", (_$, e) => ({ text: e.answer }));
  on("classic.Stop", () => ({}));
  on("config.list", () => ({ value: [{ key: "theme", value: "dark" }] }) as never);
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("command.register", () => ({ value: {} }) as never);
  on("classic.SessionStart", () => ({}));
  on("classic.UserPromptSubmit", () => ({}));
  on("classic.PostModelSwitch", () => ({}));
  on("classic.CwdChanged", () => ({}));
  on("classic.PostToolUse", () => ({}));

  await $.session.start(SESSION_START);
}

function rateLimitsOf(limits: Limit[]) {
  return limits.map(({ kind, percentUsed, resetsInMs }) => ({
    kind,
    percentUsed,
    ...(resetsInMs === undefined ? {} : { resetsAt: new Date(NOW + resetsInMs).toISOString() }),
  }));
}

async function measureUsage(
  $: Engine,
  reading: { tokens?: number; window?: number; limits?: Limit[] },
): Promise<void> {
  await $.session.measure({
    context: { tokens: reading.tokens, window: reading.window ?? 200_000 },
    rateLimits: rateLimitsOf(reading.limits ?? []),
    changed: ["context", "rateLimits"],
  });
}

async function effortStop($: Engine, level: string): Promise<void> {
  await $.classic.Stop({ stop_hook_active: false, effort: { level } });
}

function pathPiece(pieces: Piece[]): string {
  return pieces.filter((piece) => piece.color === ACCENT).at(-1)?.text ?? "";
}

function modelSwitch(
  from: string,
  to: string,
): Parameters<Engine["classic"]["PostModelSwitch"]>[0] {
  return {
    from_model: from,
    to_model: to,
    requested_model: to,
    source: "command",
    context_tokens: 0,
    prompt_cache_warm: false,
    cache_ttl: "5m",
    estimated_cache_write_usd: 0,
    pricing: "catalog",
  };
}

function accent(text: string): Piece {
  return { text, color: ACCENT, bold: true };
}

function muted(text: string): Piece {
  return { text, color: MUTED, bold: true };
}

async function piecesOf($: Engine, hint = ENGINE_HINT): Promise<Piece[]> {
  const mounted = await $.ui.mount({
    plugin: "vane",
    surface: "terminal",
    component: "PromptHint",
    props: { isDraft: false, isWorking: false, hint },
  });
  const { children = [] } = (await mounted.drawn()) as { children?: DrawnText[] };
  return children.map((child) => ({
    text: shownText(child),
    color: child.props?.color,
    bold: child.props?.bold,
  }));
}

type DrawnText = { props?: { color?: string; bold?: boolean }; children?: unknown[] };

function shownText(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(shownText).join("");
  const children = (node as { children?: unknown[] } | undefined)?.children ?? [];
  return children.map(shownText).join("");
}
