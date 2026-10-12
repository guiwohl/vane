import type { ElementTable, RenderElement } from "claude-code";

import type { UsageSnap } from "../types";
import { formatTokens } from "./format";
import { bar, header, paneHeaderLook } from "./pane-kit";
import { paneInk } from "./pane-ink";
import { LABEL_CELLS } from "./series-draw";
import { resetIn } from "./status-line";

type Ui = ElementTable;

export type GaugeView = {
  usage: UsageSnap;
  usd: number | null;
  now: number;
  width: number;
};

type Gauge = { label: string; percent: number | null; detail: string };

const TITLE = "Gauges";
const PERCENT_CELLS = 4;
const DETAIL_GAP = 2;
const DETAIL_CELLS = 11;
const CHROME_CELLS = LABEL_CELLS + 1 + 1 + PERCENT_CELLS + DETAIL_GAP + DETAIL_CELLS;
const LIMITS = [
  { key: "5h", label: "5h limit" },
  { key: "7d", label: "7d limit" },
];
const NO_VALUE = "–";
const ALARM_PERCENT = 90;
const MILLION = 1_000_000;

function compactTokens(tokens: number): string {
  return tokens < MILLION
    ? formatTokens(tokens)
    : `${(tokens / MILLION).toFixed(1).replace(/\.0$/, "")}M`;
}

function gauges({ usage, now }: GaugeView): Gauge[] {
  const { tokens, window } = usage;
  const hasContext = tokens !== null && window !== null && window > 0;
  return [
    {
      label: "context",
      percent: hasContext ? (tokens / window) * 100 : null,
      detail: hasContext ? `${compactTokens(tokens)} / ${compactTokens(window)}` : "",
    },
    ...LIMITS.map(({ key, label }) => {
      const limit = usage.limits.find((one) => one.label === key);
      const reset = limit === undefined ? null : resetIn(limit.resetsAt, now);
      return { label, percent: limit?.percent ?? null, detail: reset === null ? "" : `↻ ${reset}` };
    }),
  ];
}

function gaugeRow(ui: Ui, gauge: Gauge, cells: number): RenderElement {
  const { Text } = ui;
  const ink = paneInk();
  const isAlarmed = gauge.percent !== null && gauge.percent >= ALARM_PERCENT;
  const hue = isAlarmed ? ink.failed : ink.hues[0];
  const figure = gauge.percent === null ? NO_VALUE : `${Math.round(gauge.percent)}%`;
  return (
    <Text key={gauge.label} wrap="truncate-end">
      <Text color={ink.muted} wrap="truncate-end">
        {`${gauge.label.padEnd(LABEL_CELLS)} `}
      </Text>
      {bar(ui, gauge.percent ?? 0, 100, cells, hue)}
      <Text color={hue} wrap="truncate-end">
        {` ${figure.padStart(PERCENT_CELLS)}${" ".repeat(DETAIL_GAP)}`}
      </Text>
      <Text color={ink.muted} wrap="truncate-end">
        {gauge.detail.padEnd(DETAIL_CELLS)}
      </Text>
    </Text>
  );
}

function costRow({ Text }: Ui, usd: number | null): RenderElement {
  const ink = paneInk();
  return (
    <Text key="cost" wrap="truncate-end">
      <Text color={ink.muted} wrap="truncate-end">
        {`${"cost".padEnd(LABEL_CELLS)} `}
      </Text>
      <Text color={usd === null ? ink.muted : ink.hues[0]} wrap="truncate-end">
        {usd === null ? NO_VALUE : `$${usd.toFixed(2)}`}
      </Text>
    </Text>
  );
}

export function gaugeBlock(ui: Ui, view: GaugeView): RenderElement[] {
  const cells = Math.max(0, view.width - CHROME_CELLS);
  return [
    header(ui, TITLE, paneHeaderLook(), view.width),
    ...gauges(view).map((gauge) => gaugeRow(ui, gauge, cells)),
    costRow(ui, view.usd),
  ];
}
