import { atom, read } from "claude-code";
import type { On } from "claude-code";

import type { PromptInfo, UsageSnap } from "../types";
import { shortModel } from "./format";
import { tildePath } from "./paths";
import { clipStart } from "./text-width";

const DROPPED_HINTS = new Set(["(shift+tab to cycle)", "← for agents"]);
const ACCENT = "claude";
const MUTED = "inactive";
const NO_EFFORT = "—";
const JOIN = " · ";
const PATH_ROOM = 36;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

type Piece = { text: string; color: string | undefined };

const PAD: Piece = { text: "  ", color: undefined };

const usageAtom = atom(
  { plugin: "vane", key: "usage" } as const,
  { context: null, limits: [], tokens: null, window: null } as UsageSnap,
);
const promptInfoAtom = atom(
  { plugin: "vane", key: "promptInfo" } as const,
  { model: "", effort: null, cwd: "" } as PromptInfo,
);

export function renderStatusLine(on: On): void {
  on("ui.render", { component: "PromptHint" }, async ($, e) => {
    const [usage, info, home, nowMs] = await Promise.all([
      read($, usageAtom),
      read($, promptInfoAtom),
      $.env.get("HOME"),
      $.clock.now(),
    ]);
    const { Box, Text } = $.ui.resolve(e);
    const kept = keptHint(e.props.hint);

    return (
      <Box>
        {statusPieces(usage, info, home, nowMs).map((piece, index) => (
          <Text key={String(index)} bold color={piece.color} wrap="truncate-end">
            {piece.text}
          </Text>
        ))}
        {kept === "" ? null : (
          <Text color={MUTED} wrap="truncate-end">
            {kept}
          </Text>
        )}
      </Box>
    );
  });
}

function statusPieces(
  usage: UsageSnap,
  info: PromptInfo,
  home: string | undefined,
  nowMs: number,
): Piece[] {
  return [
    contextPieces(usage),
    modelPieces(info),
    limitPieces(usage, nowMs),
    pathPieces(info, home),
  ]
    .filter((pieces) => pieces.length > 0)
    .flatMap((pieces) => [PAD, ...pieces, PAD]);
}

function contextPieces(usage: UsageSnap): Piece[] {
  if (usage.tokens === null || usage.window === null) return [];

  return [
    { text: humanize(usage.tokens), color: ACCENT },
    { text: ` / ${humanize(usage.window)}`, color: MUTED },
  ];
}

function humanize(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;

  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

function modelPieces(info: PromptInfo): Piece[] {
  const name = titled(shortModel(info.model));
  if (name === "") return [];
  const effort = info.effort === null || info.effort === "" ? NO_EFFORT : info.effort;

  return [
    { text: `${name} `, color: ACCENT },
    { text: `(${effort})`, color: MUTED },
  ];
}

function titled(name: string): string {
  return name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function limitPieces(usage: UsageSnap, nowMs: number): Piece[] {
  if (usage.limits.length === 0) return [{ text: "usage —", color: MUTED }];

  return usage.limits
    .flatMap((limit, index) => {
      const reset = resetIn(limit.resetsAt, nowMs);

      return [
        ...(index === 0 ? [] : [{ text: JOIN, color: MUTED }]),
        { text: `${Math.round(limit.percent)}%`, color: ACCENT },
        { text: reset === null ? "" : ` ↻ ${reset}`, color: MUTED },
      ];
    })
    .filter((piece) => piece.text !== "");
}

export function resetIn(resetsAt: string | undefined, nowMs: number): string | null {
  if (resetsAt === undefined) return null;
  const left = Date.parse(resetsAt) - nowMs;
  if (Number.isNaN(left) || left <= 0) return null;
  if (left >= DAY_MS) {
    return `${Math.floor(left / DAY_MS)}d${Math.floor((left % DAY_MS) / HOUR_MS)}h`;
  }
  if (left >= HOUR_MS) {
    const minutes = String(Math.floor((left % HOUR_MS) / MINUTE_MS)).padStart(2, "0");

    return `${Math.floor(left / HOUR_MS)}h${minutes}m`;
  }

  return `${Math.max(1, Math.floor(left / MINUTE_MS))}m`;
}

function pathPieces(info: PromptInfo, home: string | undefined): Piece[] {
  const path = tildePath(info.cwd, home);
  if (path === "") return [];

  return [{ text: clipStart(path, PATH_ROOM), color: ACCENT }];
}

function keptHint(hint: string): string {
  return hint
    .split(JOIN)
    .filter((part) => !DROPPED_HINTS.has(part))
    .join(JOIN);
}
