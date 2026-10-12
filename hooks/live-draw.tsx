import type { ElementTable, RenderElement } from "claude-code";

import type { Activity, AgentNode, BackgroundWork, StartedCall } from "../types";
import { nameOf } from "./agents-model";
import { header, labelButton, paneHeaderLook } from "./pane-kit";
import { paneInk } from "./pane-ink";
import type { PaneInk } from "./pane-ink";
import { formatElapsed, LABEL_CELLS } from "./series-draw";
import { clipEnd, displayWidth } from "./text-width";

type Ui = ElementTable;

type LiveKind = "tool" | "background" | "agent" | "failure";

export type LiveEntry = { key: string; kind: LiveKind; tool: string; target: string; at: number };

export type LiveSources = {
  running: StartedCall[];
  agents: AgentNode[];
  activity: Activity[];
  background: BackgroundWork[];
  now: number;
};

const BACKGROUND_TOOL = "bg";
const TITLE = "Now";
const QUIET_TEXT = "nothing running · no failures";
const GLYPHS: Record<LiveKind, string> = { tool: "●", background: "◆", agent: "●", failure: "✗" };
const PRESSABLE: readonly LiveKind[] = ["tool", "failure"];
const TOOL_CELLS = LABEL_CELLS - 2;
const TIME_CELLS = 9;
const SHOWN_TOOLS = 3;
const SHOWN_BACKGROUND = 2;
const SHOWN_AGENTS = 2;
const SHOWN_FAILURES = 3;
export const FAILURE_WINDOW_MS = 3 * 60_000;

export function liveEntries({
  running,
  agents,
  activity,
  background,
  now,
}: LiveSources): LiveEntry[] {
  const failures = activity
    .filter(
      (entry) =>
        entry.isErrored && entry.endedAt !== undefined && now - entry.endedAt <= FAILURE_WINDOW_MS,
    )
    .slice(-SHOWN_FAILURES)
    .reverse();
  return [
    ...running.slice(-SHOWN_TOOLS).map((call) => ({
      key: call.callId,
      kind: "tool" as const,
      tool: call.tool,
      target: call.target,
      at: call.startedAt,
    })),
    ...background
      .filter((work) => work.type !== "subagent")
      .slice(-SHOWN_BACKGROUND)
      .map((work) => ({
        key: work.id,
        kind: "background" as const,
        tool: BACKGROUND_TOOL,
        target: `${work.type}: ${work.label}`,
        at: work.startedAt,
      })),
    ...agents.slice(-SHOWN_AGENTS).map((node) => ({
      key: node.id,
      kind: "agent" as const,
      tool: "agent",
      target: nameOf(node),
      at: node.startedAt,
    })),
    ...failures.map((entry) => ({
      key: entry.id,
      kind: "failure" as const,
      tool: entry.tool,
      target: entry.target,
      at: entry.endedAt!,
    })),
  ];
}

function hueOf(kind: LiveKind, ink: PaneInk): string | undefined {
  if (kind === "failure") return ink.failed;
  return kind === "background" ? ink.hues[0] : ink.hues[1];
}

function fit(text: string, cells: number): string {
  const clipped = clipEnd(text, cells);
  return clipped + " ".repeat(Math.max(0, cells - displayWidth(clipped)));
}

function liveRow(
  ui: Ui,
  entry: LiveEntry,
  now: number,
  width: number,
  openCall: (id: string) => void,
): RenderElement {
  const { Box, Text } = ui;
  const ink = paneInk();
  const hue = hueOf(entry.kind, ink);
  const elapsed = formatElapsed(Math.max(0, now - entry.at));
  const time = entry.kind === "failure" ? `${elapsed} ago` : elapsed;
  const targetCells = Math.max(0, width - LABEL_CELLS - 1 - 1 - TIME_CELLS);
  const lead = (
    <Text color={hue} wrap="truncate-end">
      {`${GLYPHS[entry.kind]} ${fit(entry.tool, TOOL_CELLS)} `}
    </Text>
  );
  const tail = (
    <Text color={ink.muted} wrap="truncate-end">
      {` ${time.padStart(TIME_CELLS)}`}
    </Text>
  );
  if (!PRESSABLE.includes(entry.kind))
    return (
      <Text key={entry.key} wrap="truncate-end">
        {lead}
        <Text color={ink.text} wrap="truncate-end">
          {fit(entry.target, targetCells)}
        </Text>
        {tail}
      </Text>
    );
  return (
    <Box key={entry.key} flexDirection="row" width={width} height={1}>
      <Box flexShrink={0}>{lead}</Box>
      <Box width={targetCells} flexShrink={0}>
        {labelButton(ui, {
          key: `live-${entry.key}`,
          label: clipEnd(entry.target, targetCells),
          onPress: () => openCall(entry.key),
        })}
      </Box>
      <Box flexShrink={0}>{tail}</Box>
    </Box>
  );
}

export function liveBlock(
  ui: Ui,
  entries: LiveEntry[],
  now: number,
  width: number,
  openCall: (id: string) => void,
): RenderElement[] {
  const { Text } = ui;
  return [
    header(ui, TITLE, paneHeaderLook(), width),
    ...(entries.length === 0
      ? [
          <Text key="quiet" color={paneInk().muted} wrap="truncate-end">
            {QUIET_TEXT}
          </Text>,
        ]
      : entries.map((entry) => liveRow(ui, entry, now, width, openCall))),
  ];
}
