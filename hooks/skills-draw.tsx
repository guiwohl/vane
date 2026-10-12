import type { ElementTable, RenderElement } from "claude-code";

import { labelButton } from "./pane-kit";
import { paneInk } from "./pane-ink";
import { byOriginThenUses, countCells, countColumn, originWord } from "./row-kit";
import type { Origin } from "./row-kit";

type Ui = ElementTable;

export type SkillOwner = "user" | "project" | "plugin" | "built-in";

export type SkillEntry = {
  name: string;
  description: string;
  owner: SkillOwner;
  plugin?: string;
};

export type SkillsView = {
  width: number;
  uses: Record<string, number>;
  skills: readonly SkillEntry[];
  expanded: ReadonlySet<string>;
  toggle: (name: string) => void;
  insert: (name: string) => void;
};

const OPEN_GLYPH = "▾";
const FOLDED_GLYPH = "▸";
const GLYPH_CELLS = 1;
const ROW_GAP_CELLS = 1;
const OWNER_ORIGINS: Record<SkillOwner, Origin> = {
  project: "project",
  user: "global",
  plugin: "other",
  "built-in": "other",
};

export function skillsTab(ui: Ui, view: SkillsView): RenderElement {
  const { Box, Text } = ui;
  if (view.skills.length === 0) {
    return (
      <Text color={paneInk().muted} wrap="truncate-end">
        no skills
      </Text>
    );
  }
  const cells = countCells(view.skills.map((skill) => view.uses[skill.name] ?? 0));
  const ranked = byOriginThenUses(
    view.skills,
    (skill) => OWNER_ORIGINS[skill.owner],
    (skill) => view.uses[skill.name] ?? 0,
  );
  return (
    <Box flexDirection="column" width={view.width}>
      {ranked.flatMap((skill) => skillRows(ui, skill, view, cells))}
    </Box>
  );
}

function skillRows(ui: Ui, skill: SkillEntry, view: SkillsView, cells: number): RenderElement[] {
  const { Box, Button, Text } = ui;
  const isOpen = view.expanded.has(skill.name);
  const descriptionIndent = cells + GLYPH_CELLS + 2 * ROW_GAP_CELLS;
  const rows: RenderElement[] = [
    <Box
      key={`${skill.name}-row`}
      flexDirection="row"
      width={view.width}
      height={1}
      columnGap={ROW_GAP_CELLS}
    >
      {countColumn(ui, view.uses[skill.name], cells)}
      {skill.description === "" ? (
        <Box width={GLYPH_CELLS} />
      ) : (
        <Button
          key={`${skill.name}-toggle`}
          label={isOpen ? OPEN_GLYPH : FOLDED_GLYPH}
          plain
          dimColor
          onPress={() => view.toggle(skill.name)}
        />
      )}
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        {labelButton(ui, {
          key: skill.name,
          label: skill.name,
          onPress: () => view.insert(skill.name),
        })}
      </Box>
      {originWord(ui, OWNER_ORIGINS[skill.owner])}
    </Box>,
  ];
  if (!isOpen || skill.description === "") return rows;
  rows.push(
    <Box
      key={`${skill.name}-description`}
      marginLeft={descriptionIndent}
      width={view.width - descriptionIndent}
    >
      <Text color={paneInk().muted} wrap="wrap">
        {skill.description}
      </Text>
    </Box>,
  );
  return rows;
}
