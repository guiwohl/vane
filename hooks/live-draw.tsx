import type { ElementTable, RenderElement } from "claude-code";

import type { Activity, AgentNode, StartedCall } from "../types";
import { nameOf } from "./agents-model";
import { header, paneHeaderLook } from "./pane-kit";
import { paneInk } from "./pane-ink";
import { formatElapsed, LABEL_CELLS } from "./series-draw";
import { clipEnd, displayWidth } from "./text-width";

type Ui = ElementTable;

type LiveKind = "tool" | "agent" | "failure";

export type LiveEntry = { key: string; kind: LiveKind; tool: string; target: string; at: number };

export type LiveSources = {
  running: StartedCall[];
  agents: AgentNode[];
  activity: Activity[];
};

const TITLE = "Now";
const QUIET_TEXT = "nothing running · no failures";
const GLYPHS: Record<LiveKind, string> = { tool: "●", agent: "●", failure: "✗" };
const TOOL_CELLS = LABEL_CELLS - 2;
const TIME_CELLS = 9;
const SHOWN_TOOLS = 3;
const SHOWN_AGENTS = 2;
const SHOWN_FAILURES = 3;

export function liveEntries({ running, agents, activity }: LiveSources): LiveEntry[] {
  const failures = activity
    .filter((entry) => entry.isErrored && entry.endedAt !== undefined)
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

function fit(text: string, cells: number): string {
  const clipped = clipEnd(text, cells);
  return clipped + " ".repeat(Math.max(0, cells - displayWidth(clipped)));
}

function liveRow({ Text }: Ui, entry: LiveEntry, now: number, width: number): RenderElement {
  const ink = paneInk();
  const hue = entry.kind === "failure" ? ink.failed : ink.hues[1];
  const elapsed = formatElapsed(Math.max(0, now - entry.at));
  const time = entry.kind === "failure" ? `${elapsed} ago` : elapsed;
  const targetCells = Math.max(0, width - LABEL_CELLS - 1 - 1 - TIME_CELLS);
  return (
    <Text key={entry.key} wrap="truncate-end">
      <Text color={hue} wrap="truncate-end">
        {`${GLYPHS[entry.kind]} ${fit(entry.tool, TOOL_CELLS)} `}
      </Text>
      <Text color={ink.text} wrap="truncate-end">
        {fit(entry.target, targetCells)}
      </Text>
      <Text color={ink.muted} wrap="truncate-end">
        {` ${time.padStart(TIME_CELLS)}`}
      </Text>
    </Text>
  );
}

export function liveBlock(
  ui: Ui,
  entries: LiveEntry[],
  now: number,
  width: number,
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
      : entries.map((entry) => liveRow(ui, entry, now, width))),
  ];
}
