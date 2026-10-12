import type { ElementTable, RenderElement } from "claude-code";

import type { Activity, SeriesRing } from "../types";
import { formatTokens, MS_PER_SECOND } from "./format";
import { plural } from "./pane-kit";
import { paneInk } from "./pane-ink";
import { larger, sum } from "./series-ring";
import { isEditTool } from "./tools";

type Ui = ElementTable;

const LEVEL_GLYPHS = " ▁▂▃▄▅▆▇█";
const EIGHTHS = LEVEL_GLYPHS.length - 1;
const CHART_ROWS = 3;
const MIN_BUCKETS = 16;
const STEADY_SHARE = 0.9;
const STEADY_LEVEL = 0.5;
const BASELINE = "▁";
const NO_VALUE = "–";
const NOW = "now";
export const LABEL_CELLS = 8;
const VALUE_CELLS = 7;
const GAPS = 2;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

type DeckRow = {
  label: string;
  hue: number;
  values: number[];
  value: string;
  ceiling: number | null;
  join: (a: number, b: number) => number;
};

export function resample(
  values: number[],
  cells: number,
  join: (a: number, b: number) => number,
): number[] {
  return Array.from({ length: cells }, (_, cell) => {
    const first = Math.floor((cell * values.length) / cells);
    const end = Math.max(first + 1, Math.floor(((cell + 1) * values.length) / cells));
    return values.slice(first, end).reduce(join);
  });
}

export function formatElapsed(ms: number): string {
  const minutes = Math.floor(ms / MS_PER_SECOND / SECONDS_PER_MINUTE);
  if (minutes >= MINUTES_PER_HOUR) {
    const minute = String(minutes % MINUTES_PER_HOUR).padStart(2, "0");
    return `${Math.floor(minutes / MINUTES_PER_HOUR)}h${minute}m`;
  }
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(ms / MS_PER_SECOND)}s`;
}

function deckRows(series: SeriesRing, tokens: number | null, window: number | null): DeckRow[] {
  const cost = series.cost.at(-1);
  return [
    {
      label: "tokens",
      hue: 0,
      values: series.tokens,
      value: tokens === null ? NO_VALUE : formatTokens(tokens),
      ceiling: window !== null && window > 0 ? window : null,
      join: larger,
    },
    {
      label: "cost",
      hue: 2,
      values: series.cost,
      value: cost === undefined ? NO_VALUE : `$${cost.toFixed(2)}`,
      ceiling: null,
      join: larger,
    },
    {
      label: "turns",
      hue: 3,
      values: series.turns,
      value: series.origin === null ? NO_VALUE : String(series.turns.reduce(sum, 0)),
      ceiling: null,
      join: sum,
    },
  ];
}

function levelsOf(cells: number[], ceiling: number | null): number[] {
  const peak = cells.reduce(larger, 0);
  const scale = ceiling ?? peak;
  const isSteady = ceiling === null && Math.min(...cells) >= peak * STEADY_SHARE;
  return cells.map((value) => (isSteady ? STEADY_LEVEL : Math.min(1, value / scale)));
}

function glyphAt(level: number, row: number): string {
  const fill = Math.min(1, Math.max(0, level * CHART_ROWS - row));
  const eighths = Math.round(fill * EIGHTHS);
  return LEVEL_GLYPHS[row === 0 && level > 0 ? Math.max(1, eighths) : eighths]!;
}

function chartRows(row: DeckRow, cells: number): string[] {
  const resampled = resample(row.values, cells, row.join);
  const levels = levelsOf(resampled, row.ceiling);
  return Array.from({ length: CHART_ROWS }, (_, i) => {
    const drawn = CHART_ROWS - 1 - i;
    return levels.map((level) => glyphAt(level, drawn)).join("");
  });
}

function deckRow({ Text }: Ui, row: DeckRow, width: number): RenderElement[] {
  const { hues, muted } = paneInk();
  const hue = hues[row.hue]!;
  const cells = Math.max(0, width - LABEL_CELLS - GAPS - VALUE_CELLS);
  const isBlank = row.values.every((value) => value <= 0);
  const rows = isBlank ? ["", "", BASELINE.repeat(cells)] : chartRows(row, cells);
  return rows.map((chart, i) => (
    <Text key={`${row.label}-${i}`} wrap="truncate-end">
      <Text color={hue} wrap="truncate-end">
        {`${(i === 0 ? row.label : "").padEnd(LABEL_CELLS)} `}
      </Text>
      <Text color={isBlank ? muted : hue} wrap="truncate-end">
        {chart.padEnd(cells)}
      </Text>
      <Text color={hue} wrap="truncate-end">
        {` ${(i === 0 ? row.value : "").padStart(VALUE_CELLS)}`}
      </Text>
    </Text>
  ));
}

function axisLine({ Text }: Ui, series: SeriesRing, width: number): RenderElement {
  const cells = Math.max(0, width - LABEL_CELLS - GAPS - VALUE_CELLS);
  const left = `-${formatElapsed(series.intervalMs * series.tokens.length)}`;
  const axis = `${left}${" ".repeat(Math.max(1, cells - left.length - NOW.length))}${NOW}`;
  return (
    <Text color={paneInk().muted} wrap="truncate-end">
      {`${" ".repeat(LABEL_CELLS + 1)}${axis}`}
    </Text>
  );
}

export function sparkDeck(
  ui: Ui,
  series: SeriesRing,
  tokens: number | null,
  window: number | null,
  width: number,
): RenderElement[] {
  const { Text } = ui;
  const buckets = series.tokens.length;
  if (buckets < MIN_BUCKETS) {
    return [
      <Text key="collecting" color={paneInk().muted} wrap="truncate-end">
        {`still collecting · ${buckets} of ${MIN_BUCKETS} points`}
      </Text>,
    ];
  }
  return [
    ...deckRows(series, tokens, window).flatMap((row) => deckRow(ui, row, width)),
    axisLine(ui, series, width),
  ];
}

export function summaryLine(
  { Text }: Ui,
  activity: Activity[],
  startedAt: number,
  now: number,
  rereads: number,
): RenderElement {
  const edits = activity.filter((entry) => isEditTool(entry.tool) && !entry.isErrored).length;
  const failures = activity.filter((entry) => entry.isErrored).length;
  const parts = [
    ...(startedAt === 0 ? [] : [{ text: formatElapsed(now - startedAt), color: paneInk().text }]),
    { text: `${edits} ${plural("edit", edits)}`, color: paneInk().text },
    {
      text: `${failures} ${plural("failure", failures)}`,
      color: failures > 0 ? paneInk().failed : paneInk().muted,
    },
    ...(rereads > 0
      ? [{ text: `${rereads} ${plural("reread", rereads)} trimmed`, color: paneInk().text }]
      : []),
  ];
  return (
    <Text wrap="truncate-end">
      {parts.map((part, i) => (
        <Text key={part.text} wrap="truncate-end">
          <Text color={paneInk().muted} wrap="truncate-end">
            {i === 0 ? "" : " · "}
          </Text>
          <Text color={part.color} wrap="truncate-end">
            {part.text}
          </Text>
        </Text>
      ))}
    </Text>
  );
}
