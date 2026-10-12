import type { ElementTable, RenderElement } from "claude-code";

import type { CommandEntry } from "./commands-load";
import { labelButton } from "./pane-kit";
import { paneInk } from "./pane-ink";
import { byOriginThenUses, countCells, countColumn, originWord } from "./row-kit";

type Ui = ElementTable;

export type CommandsView = {
  width: number;
  commands: readonly CommandEntry[];
  uses: Record<string, number>;
  insert: (name: string) => void;
};

export function commandsTab(ui: Ui, view: CommandsView): RenderElement {
  const { Box, Text } = ui;
  if (view.commands.length === 0) {
    return (
      <Text color={paneInk().muted} wrap="truncate-end">
        no commands
      </Text>
    );
  }
  const cells = countCells(view.commands.map((command) => view.uses[command.name] ?? 0));
  const ranked = byOriginThenUses(
    view.commands,
    (command) => command.origin,
    (command) => view.uses[command.name] ?? 0,
  );
  return (
    <Box flexDirection="column" width={view.width}>
      {ranked.map((command) => commandRow(ui, command, view, cells))}
    </Box>
  );
}

function commandRow(
  ui: Ui,
  command: CommandEntry,
  view: CommandsView,
  cells: number,
): RenderElement {
  const { Box, Text } = ui;
  return (
    <Box
      key={`command-${command.name}`}
      flexDirection="row"
      width={view.width}
      height={1}
      columnGap={1}
    >
      {countColumn(ui, view.uses[command.name], cells)}
      <Box flexShrink={0}>
        {labelButton(ui, {
          key: `/${command.name}`,
          label: `/${command.name}`,
          onPress: () => view.insert(command.name),
        })}
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text color={paneInk().muted} wrap="truncate-end">
          {command.description}
        </Text>
      </Box>
      {originWord(ui, command.origin)}
    </Box>
  );
}
