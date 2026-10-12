import type { ElementTable, RenderElement } from "claude-code";

import { paneInk } from "./pane-ink";
import { labelButton } from "./pane-kit";

type Ui = ElementTable;

export type SetupSection = {
  id: string;
  title: string;
  count?: number;
  isOpen: boolean;
  toggle: () => void;
  body?: () => RenderElement;
};

const OPEN_GLYPH = "▾";
const FOLDED_GLYPH = "▸";
const GLYPH_GAP = " ";
const COUNT_GAP_CELLS = 2;

export const BODY_INDENT_CELLS =
  Math.max(OPEN_GLYPH.length, FOLDED_GLYPH.length) + GLYPH_GAP.length;

export function setupTab(ui: Ui, width: number, sections: readonly SetupSection[]): RenderElement {
  const { Box } = ui;
  return (
    <Box flexDirection="column" width={width}>
      {sections.flatMap((section, index) => [
        ...(index > 0 ? [<Box key={`${section.id}-gap`} height={1} />] : []),
        summaryRow(ui, section, width),
        ...(section.isOpen
          ? [
              <Box
                key={`${section.id}-body`}
                flexDirection="column"
                marginLeft={BODY_INDENT_CELLS}
                width={width - BODY_INDENT_CELLS}
              >
                {section.body === undefined ? loadingRow(ui) : section.body()}
              </Box>,
            ]
          : []),
      ])}
    </Box>
  );
}

function summaryRow(ui: Ui, section: SetupSection, width: number): RenderElement {
  const { Box, Button, Text } = ui;
  const label = `${section.isOpen ? OPEN_GLYPH : FOLDED_GLYPH}${GLYPH_GAP}${section.title}`;
  return (
    <Box
      key={`${section.id}-summary`}
      flexDirection="row"
      width={width}
      height={1}
      columnGap={COUNT_GAP_CELLS}
    >
      {section.isOpen ? (
        labelButton(ui, {
          key: `${section.id}-toggle`,
          label,
          onPress: section.toggle,
        })
      ) : (
        <Button
          key={`${section.id}-toggle`}
          label={label}
          plain
          dimColor
          onPress={section.toggle}
        />
      )}
      {section.count === undefined ? null : (
        <Text color={paneInk().muted} wrap="truncate-end">
          {section.count}
        </Text>
      )}
    </Box>
  );
}

function loadingRow({ Text }: Ui): RenderElement {
  return (
    <Text color={paneInk().muted} wrap="truncate-end">
      loading…
    </Text>
  );
}
