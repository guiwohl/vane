import type {
  ContextCategory,
  ContextCategoryKind,
  ElementTable,
  RenderElement,
  SessionContextBreakdown,
} from "claude-code";

import { formatTokens } from "./format";
import { plural } from "./pane-kit";
import { paneInk } from "./pane-ink";
import { TAB_BAR_ROWS } from "./tab-bar";

type Ui = ElementTable;

export type ContextView = {
  context: SessionContextBreakdown | null;
  width: number;
  height: number;
};

type Section = { title: string; hint: string; count: number; unit: string; tokens: number };

const PERCENT = 100;
const WHOLE_PERCENT_FROM = 10;
const TOKENS_PER_M = 1_000_000;
const COLUMNS_PER_BAR_COLUMN = 8;
const BAR_MIN_COLUMNS = 4;
const BAR_MAX_COLUMNS = 10;
const GUTTER_COLUMNS = 2;
const HEADER_ROWS = 2;
const MARK_COLUMNS = 2;
const MAX_ROWS_SHORT = 1;

const GLYPH_BY_KIND: Record<ContextCategoryKind, string> = {
  used: "█",
  deferred: "█",
  free: "░",
  buffer: "▚",
};
const MARK_BY_KIND: Record<ContextCategoryKind, string> = {
  used: "■",
  deferred: "■",
  free: "–",
  buffer: "▚",
};
const UNDRAWN_MARK = "·";
const TAIL_KINDS: ContextCategoryKind[] = ["free", "buffer"];

export function contextTab(ui: Ui, view: ContextView): RenderElement {
  const { Box, Text } = ui;
  const { context } = view;
  if (context === null) {
    return (
      <Text color={paneInk().muted} wrap="truncate-end">
        no context data yet
      </Text>
    );
  }
  const barColumns = Math.min(
    BAR_MAX_COLUMNS,
    Math.max(BAR_MIN_COLUMNS, Math.floor(view.width / COLUMNS_PER_BAR_COLUMN)),
  );
  const legendColumns = view.width - barColumns - GUTTER_COLUMNS;
  const sections = sectionBlocks(ui, context);
  const barRows = view.height - TAB_BAR_ROWS - HEADER_ROWS;
  const bar = barLayout(context, barRows);
  return (
    <Box flexDirection="column" height={view.height - TAB_BAR_ROWS} overflow="hidden">
      {headerRow(ui, context)}
      {blankRow(ui, "header-gap")}
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        {barColumn(ui, context, bar, barColumns)}
        <Box width={GUTTER_COLUMNS} flexShrink={0} />
        <Box flexDirection="column" width={legendColumns} flexShrink={0} overflow="hidden">
          {legendLines(ui, context, bar, legendColumns)}
          {sections.flatMap((section, i) => [blankRow(ui, `gap-${i}`), ...section])}
        </Box>
      </Box>
    </Box>
  );
}

function shownCategories(context: SessionContextBreakdown): ContextCategory[] {
  return context.categories
    .filter((category) => category.kind !== "deferred" && category.tokens > 0)
    .sort((a, b) => tail(a) - tail(b));
}

type BarLayout = { shown: ContextCategory[]; cells: number[] };

function barLayout(context: SessionContextBreakdown, rows: number): BarLayout {
  const shown = shownCategories(context);
  const cells = cellCounts(
    clipToWindow(
      shown.map((category) => category.tokens),
      context.rawMaxTokens,
    ),
    shown.map((category) => category.kind !== "free"),
    rows,
  );
  return { shown, cells };
}

function barColumn(
  { Box, Text }: Ui,
  context: SessionContextBreakdown,
  { shown, cells }: BarLayout,
  columns: number,
): RenderElement {
  const colors = categoryColorsOf(context);
  return (
    <Box flexDirection="column" width={columns} flexShrink={0}>
      {shown.flatMap((category, i) =>
        Array.from({ length: cells[i]! }, (_, row) => (
          <Text key={`${category.name}-${row}`} color={segmentColor(category, colors)}>
            {GLYPH_BY_KIND[category.kind].repeat(columns)}
          </Text>
        )),
      )}
    </Box>
  );
}

function clipToWindow(tokens: number[], window: number): number[] {
  let remaining = window;
  return tokens.map((count) => {
    const kept = Math.min(count, remaining);
    remaining -= kept;
    return kept;
  });
}

function cellCounts(tokens: number[], mustShow: boolean[], slots: number): number[] {
  const whole = total(tokens);
  const exact = tokens.map((count) => (count / whole) * slots);
  const cells = exact.map(Math.floor);
  const byRemainder = exact
    .map((_, i) => i)
    .sort((a, b) => exact[b]! - cells[b]! - (exact[a]! - cells[a]!));
  byRemainder.slice(0, slots - total(cells)).forEach((i) => (cells[i] = cells[i]! + 1));
  const smallestLast = tokens
    .map((_, i) => i)
    .filter((i) => mustShow[i] && cells[i] === 0)
    .sort((a, b) => tokens[b]! - tokens[a]!);
  for (const i of smallestLast) {
    const donor = mostOverdrawn(cells, exact);
    if (donor === undefined || cells[donor]! - 1 - exact[donor]! <= -MAX_ROWS_SHORT) break;
    cells[donor] = cells[donor]! - 1;
    cells[i] = 1;
  }
  return cells;
}

function mostOverdrawn(cells: number[], exact: number[]): number | undefined {
  const lendable = cells.map((_, i) => i).filter((i) => cells[i]! > 1);
  return lendable.sort((a, b) => cells[b]! - exact[b]! - (cells[a]! - exact[a]!))[0];
}

function segmentColor(category: ContextCategory, colors: Map<string, string>): string | undefined {
  return category.kind === "used" ? colors.get(category.name) : paneInk().muted;
}

function categoryColorsOf(context: SessionContextBreakdown): Map<string, string> {
  const ink = paneInk();
  if (!ink.isRecoloured) {
    return new Map(context.categories.map((category) => [category.name, category.color]));
  }
  const used = context.categories.filter((category) => category.kind === "used");
  return new Map(
    context.categories.map((category) => [
      category.name,
      category.kind === "used" ? ink.hues[used.indexOf(category) % ink.hues.length]! : ink.muted,
    ]),
  );
}

function headerRow({ Box, Text }: Ui, context: SessionContextBreakdown): RenderElement {
  const ink = paneInk();
  const compaction =
    context.autoCompactThreshold === undefined
      ? ""
      : ` · compacts at ${tokensLabel(context.autoCompactThreshold)}`;
  return (
    <Box flexDirection="row" justifyContent="space-between" height={1} flexShrink={0}>
      <Text bold color={ink.text} wrap="truncate-end">
        {"◆ context "}
      </Text>
      <Box flexDirection="row" flexShrink={1}>
        <Text color={ink.muted} wrap="truncate-end">
          {`${tokensLabel(context.totalTokens)} of ${tokensLabel(context.rawMaxTokens)}${compaction} `}
        </Text>
        <Text bold color={ink.onAlert} backgroundColor={ink.alert}>
          {` ${context.percentage}% `}
        </Text>
      </Box>
    </Box>
  );
}

function legendLines(
  { Text }: Ui,
  context: SessionContextBreakdown,
  { shown, cells }: BarLayout,
  columns: number,
): RenderElement[] {
  const ink = paneInk();
  const colors = categoryColorsOf(context);
  const values = shown.map((category) => tokensLabel(category.tokens));
  const shares = shown.map((category) =>
    category.kind === "used" ? shareLabel(category.tokens, context.rawMaxTokens) : "",
  );
  const valueWidth = widest(values);
  const shareWidth = widest(shares);
  const nameWidth = Math.min(
    widest(shown.map((category) => category.name)),
    columns - MARK_COLUMNS - valueWidth - shareWidth - 2,
  );
  const rows = shown.map((category, i) => {
    const muted = category.kind === "buffer";
    const mark = cells[i] === 0 ? UNDRAWN_MARK : MARK_BY_KIND[category.kind];
    return (
      <Text key={category.name} wrap="truncate-end">
        <Text color={segmentColor(category, colors)}>{`${mark} `}</Text>
        <Text color={muted ? ink.muted : ink.text}>{`${fit(category.name, nameWidth)} `}</Text>
        <Text bold={!muted} color={muted ? ink.muted : ink.text}>
          {values[i]!.padStart(valueWidth)}
        </Text>
        <Text color={ink.muted}>{` ${shares[i]!.padStart(shareWidth)}`}</Text>
      </Text>
    );
  });
  const deferred = context.categories
    .filter((category) => category.kind === "deferred")
    .reduce((sum, category) => sum + category.tokens, 0);
  const notes = [
    cells.includes(0) ? `${UNDRAWN_MARK} too small for the bar` : null,
    deferred === 0 ? null : `${tokensLabel(deferred)} deferred, loaded on demand`,
  ].filter((note) => note !== null);
  return [
    ...rows,
    ...notes.map((note) => (
      <Text key={note} color={ink.muted} wrap="truncate-end">
        {note}
      </Text>
    )),
  ];
}

function tail(category: ContextCategory): number {
  return TAIL_KINDS.indexOf(category.kind) + 1;
}

function sectionBlocks({ Text }: Ui, context: SessionContextBreakdown): RenderElement[][] {
  const sections: Section[] = [
    {
      title: "MCP tools",
      hint: "/mcp",
      count: context.mcpTools.length,
      unit: "tool",
      tokens: sum(context.mcpTools.filter((tool) => tool.isLoaded)),
    },
    {
      title: "Custom agents",
      hint: ".claude/agents/",
      count: context.agents.length,
      unit: "agent",
      tokens: sum(context.agents),
    },
    {
      title: "Memory files",
      hint: "/memory",
      count: context.memoryFiles.length,
      unit: "file",
      tokens: sum(context.memoryFiles),
    },
    {
      title: "Skills",
      hint: "/skills",
      count: context.skills?.totalSkills ?? 0,
      unit: "skill",
      tokens: context.skills?.tokens ?? 0,
    },
  ];
  return sections
    .filter((section) => section.count > 0)
    .map((section) => [
      <Text key={`${section.title}-title`} wrap="truncate-end">
        <Text bold color={paneInk().text} wrap="truncate-end">
          {section.title}
        </Text>
        <Text color={paneInk().muted} wrap="truncate-end">{` · ${section.hint}`}</Text>
      </Text>,
      <Text key={`${section.title}-count`} color={paneInk().muted} wrap="truncate-end">
        {`└ ${section.count} ${plural(section.unit, section.count)} · ${formatTokens(section.tokens)} tokens`}
      </Text>,
    ]);
}

function blankRow({ Box }: Ui, key: string): RenderElement {
  return <Box key={key} height={1} />;
}

function total(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function sum(items: { tokens: number }[]): number {
  return items.reduce((total, item) => total + item.tokens, 0);
}

function tokensLabel(tokens: number): string {
  if (tokens < TOKENS_PER_M) return formatTokens(tokens);
  return `${Number((tokens / TOKENS_PER_M).toFixed(1))}M`;
}

function shareLabel(tokens: number, window: number): string {
  const percent = (tokens / window) * PERCENT;
  return `${Number(percent.toFixed(percent >= WHOLE_PERCENT_FROM ? 0 : 1))}%`;
}

function widest(labels: string[]): number {
  return Math.max(0, ...labels.map((label) => label.length));
}

function fit(label: string, width: number): string {
  const clipped = label.length > width ? `${label.slice(0, Math.max(0, width - 1))}…` : label;
  return clipped.padEnd(width);
}
