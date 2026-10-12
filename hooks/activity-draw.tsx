import type { ElementTable, RenderElement } from "claude-code";

import type { Activity, SeriesRing, UsageSnap } from "../types";
import { headerWithClear } from "./clear-kit";
import { gaugeBlock } from "./gauges-draw";
import { liveBlock } from "./live-draw";
import type { LiveEntry } from "./live-draw";
import { header, paneHeaderLook } from "./pane-kit";
import { paneInk } from "./pane-ink";
import { sparkDeck, summaryLine } from "./series-draw";
import { kindOf, TOOL_KINDS } from "./tools";
import type { ToolKind } from "./tools";

type Ui = ElementTable;

export type ActivityView = {
  activity: Activity[];
  series: SeriesRing;
  usage: UsageSnap;
  usd: number | null;
  rereads: number;
  live: LiveEntry[];
  now: number;
  width: number;
  height: number;
  clear: () => void;
  openCall: (id: string) => void;
};

type Block = { key: string; rank: number; lines: RenderElement[] };

export function activityTab(ui: Ui, view: ActivityView): RenderElement {
  const { Box } = ui;
  const shown = shownBlocks(blocks(ui, view), view.height);
  return (
    <Box flexDirection="column" height={view.height} overflow="hidden">
      {shown.flatMap((block, i) => [
        ...(i === 0 ? [] : [<Box key={`${block.key}-gap`} height={1} />]),
        ...block.lines.map((line, row) => (
          <Box key={`${block.key}-${row}`} flexDirection="column">
            {line}
          </Box>
        )),
      ])}
    </Box>
  );
}

function blocks(ui: Ui, view: ActivityView): Block[] {
  return [
    {
      key: "gauges",
      rank: 0,
      lines: gaugeBlock(ui, {
        usage: view.usage,
        usd: view.usd,
        now: view.now,
        width: view.width,
      }),
    },
    {
      key: "trend",
      rank: 2,
      lines: [
        header(ui, "Trend", paneHeaderLook(), view.width),
        ...sparkDeck(ui, view.series, view.usage.tokens, view.usage.window, view.width),
        summaryLine(ui, view.activity, view.series.startedAt, view.now, view.rereads),
      ],
    },
    { key: "mix", rank: 3, lines: [mixHeader(ui, view), mixBar(ui, view), mixLegend(ui, view)] },
    {
      key: "now",
      rank: view.live.length === 0 ? 4 : 1,
      lines: liveBlock(ui, view.live, view.now, view.width, view.openCall),
    },
  ];
}

function shownBlocks(all: Block[], height: number): Block[] {
  const kept = new Set<string>();
  let used = 0;
  for (const block of [...all].sort((a, b) => a.rank - b.rank)) {
    const rows = block.lines.length + (kept.size === 0 ? 0 : 1);
    if (used + rows > height) continue;
    used += rows;
    kept.add(block.key);
  }
  return all.filter((block) => kept.has(block.key));
}

function mixHeader(ui: Ui, view: ActivityView): RenderElement {
  const hasHistory = view.activity.length > 0 || view.series.origin !== null;
  return hasHistory
    ? headerWithClear(ui, "Tool mix", view.width, view.clear)
    : header(ui, "Tool mix", paneHeaderLook(), view.width);
}

function usedMixCounts(view: ActivityView): { name: ToolKind; color: string; count: number }[] {
  const counts = TOOL_KINDS.map((name) => ({
    name,
    color: paneInk().mix[name],
    count: view.activity.filter((entry) => kindOf(entry.tool) === name).length,
  }));
  return counts.filter((part) => part.count > 0);
}

function mixBar({ Text }: Ui, view: ActivityView): RenderElement {
  const counts = usedMixCounts(view);
  const total = view.activity.length;
  let drawn = 0;
  let cumulative = 0;
  const segments = counts.map((part) => {
    cumulative += part.count;
    const edge = Math.round((cumulative / total) * view.width);
    const cells = edge - drawn;
    drawn = edge;
    return { ...part, cells };
  });
  return (
    <Text wrap="truncate-end">
      {total === 0 ? (
        <Text color={paneInk().meterEmpty} wrap="truncate-end">
          {"▱".repeat(view.width)}
        </Text>
      ) : (
        segments.map((part) => (
          <Text key={part.name} color={part.color} wrap="truncate-end">
            {"█".repeat(part.cells)}
          </Text>
        ))
      )}
    </Text>
  );
}

function mixLegend({ Text }: Ui, view: ActivityView): RenderElement {
  const counts = usedMixCounts(view);
  return (
    <Text wrap="truncate-end">
      {counts.length === 0 ? (
        <Text color={paneInk().muted} wrap="truncate-end">
          nothing run yet
        </Text>
      ) : (
        counts.map((part) => (
          <Text key={part.name} wrap="truncate-end">
            <Text color={part.color} wrap="truncate-end">
              {"● "}
            </Text>
            <Text color={paneInk().muted} wrap="truncate-end">{`${part.name} `}</Text>
            <Text color={paneInk().text} wrap="truncate-end">{`${part.count}  `}</Text>
          </Text>
        ))
      )}
    </Text>
  );
}
