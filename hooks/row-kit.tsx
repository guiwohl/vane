import type { ElementTable, RenderElement } from "claude-code";

import { paneInk } from "./pane-ink";

type Ui = ElementTable;

export type Origin = "project" | "global" | "other";

const ORIGIN_ORDER: readonly Origin[] = ["project", "global", "other"];
const ORIGIN_WORDS: Record<Origin, string> = {
  project: "(Project)",
  global: "(Global)",
  other: "(Built-in)",
};
const MIN_COUNT_CELLS = 2;

export function countCells(counts: readonly number[]): number {
  return Math.max(MIN_COUNT_CELLS, ...counts.map((count) => String(count).length));
}

export function countLabel(count: number | undefined, cells: number): string {
  return count ? String(count).padStart(cells) : " ".repeat(cells);
}

export function countColumn(
  { Box, Text }: Ui,
  count: number | undefined,
  cells: number,
): RenderElement {
  return (
    <Box width={cells} flexShrink={0}>
      <Text color={paneInk().muted} wrap="truncate-end">
        {countLabel(count, cells)}
      </Text>
    </Box>
  );
}

export function originWord({ Box, Text }: Ui, origin: Origin): RenderElement {
  return (
    <Box flexShrink={0}>
      <Text color={paneInk().muted} wrap="truncate-end">
        {ORIGIN_WORDS[origin]}
      </Text>
    </Box>
  );
}

export function byOriginThenUses<T extends { name: string }>(
  items: readonly T[],
  originOf: (item: T) => Origin,
  usesOf: (item: T) => number,
): T[] {
  return [...items].sort(
    (left, right) =>
      ORIGIN_ORDER.indexOf(originOf(left)) - ORIGIN_ORDER.indexOf(originOf(right)) ||
      usesOf(right) - usesOf(left) ||
      left.name.localeCompare(right.name),
  );
}
