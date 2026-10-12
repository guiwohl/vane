import type { ElementTable, RenderElement, SessionMessage, ToolUseSummary } from "claude-code";

import type { AgentNode, CallRecord } from "../types";
import { nameOf } from "./agents-model";
import { button, labelButton, statusDot } from "./pane-kit";
import { paneInk } from "./pane-ink";
import { relativePath } from "./paths";
import { clipEnd, clipStart } from "./text-width";
import { isPathTool, targetOf } from "./tools";

type Ui = ElementTable;

export type TranscriptView = {
  messages: SessionMessage[];
  calls: CallRecord[];
  cwd: string;
  width: number;
  openCallId: string | null;
  openCall: (id: string) => void;
  closeCall: () => void;
  close: () => void;
};

type Item = { kind: "text"; text: string } | { kind: "tool"; use: ToolUseSummary };

type Block = { role: SessionMessage["role"]; items: Item[] };

const MAIN_AGENT = "Main-Agent";
const ROLE_BAR = "▌ ";
const BODY_INDENT = 2;
const TOOL_INDENT = 4;
const MAX_TOOL_CELLS = 16;
const TOOL_GAP = 3;
const HEADER_GAP = 2;

export function agentTranscript(ui: Ui, node: AgentNode, view: TranscriptView): RenderElement {
  const { Box, Text } = ui;
  const blocks = blocksOf(view.messages);
  return (
    <Box flexDirection="column" width={view.width}>
      <Box flexDirection="row" columnGap={HEADER_GAP} height={1}>
        {button(ui, { key: "back", label: "back", onPress: view.close })}
        <Text bold color={paneInk().text} wrap="truncate-end">
          {[nameOf(node), node.description].filter((part) => part !== "").join(" · ")}
        </Text>
      </Box>
      {blocks.length === 0 ? (
        <Text color={paneInk().muted} wrap="truncate-end">
          no messages yet
        </Text>
      ) : (
        blocks.map((block, i) => blockRows(ui, block, i, node, view))
      )}
    </Box>
  );
}

function blocksOf(messages: SessionMessage[]): Block[] {
  return messages
    .map((message) => ({ role: message.role, items: itemsOf(message) }))
    .filter((block) => block.items.length > 0)
    .reduce<Block[]>((blocks, block) => {
      const last = blocks.at(-1);
      return last?.role === block.role
        ? [...blocks.slice(0, -1), { role: last.role, items: [...last.items, ...block.items] }]
        : [...blocks, block];
    }, []);
}

function itemsOf(message: SessionMessage): Item[] {
  return [
    ...(message.text === "" ? [] : [{ kind: "text" as const, text: message.text }]),
    ...message.toolUses.map((use) => ({ kind: "tool" as const, use })),
  ];
}

function blockRows(
  ui: Ui,
  block: Block,
  index: number,
  node: AgentNode,
  view: TranscriptView,
): RenderElement {
  const { Box, Text, Markdown } = ui;
  const toolCells = Math.min(
    MAX_TOOL_CELLS,
    Math.max(0, ...block.items.map((item) => (item.kind === "tool" ? item.use.tool.length : 0))),
  );
  return (
    <Box key={`block-${index}`} flexDirection="column">
      <Box height={1} />
      <Text wrap="truncate-end">
        <Text color={paneInk().section} wrap="truncate-end">
          {ROLE_BAR}
        </Text>
        <Text bold color={paneInk().section} wrap="truncate-end">
          {block.role === "user" ? MAIN_AGENT : nameOf(node)}
        </Text>
      </Text>
      {block.items.map((item, i) => (
        <Box key={`item-${i}`} flexDirection="column">
          {i > 0 ? <Box height={1} /> : null}
          {item.kind === "tool" ? (
            toolRow(ui, item.use, toolCells, view)
          ) : (
            <Box marginLeft={BODY_INDENT} width={view.width - BODY_INDENT}>
              <Markdown text={item.text} />
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

function toolRow(
  ui: Ui,
  use: ToolUseSummary,
  toolCells: number,
  view: TranscriptView,
): RenderElement {
  const { Box, Text } = ui;
  const glyph = use.isError === true ? statusDot("failed") : { text: "▸", color: paneInk().tool };
  const leadCells = TOOL_INDENT + 2 + toolCells + TOOL_GAP;
  return (
    <Box key={`tool-row-${use.tool_use_id}`} flexDirection="row" width={view.width} height={1}>
      <Box flexShrink={0}>
        <Text wrap="truncate-end">
          <Text color={glyph.color} wrap="truncate-end">
            {`${" ".repeat(TOOL_INDENT)}${glyph.text} `}
          </Text>
          <Text bold color={paneInk().tool} wrap="truncate-end">
            {clipEnd(use.tool, toolCells).padEnd(toolCells)}
          </Text>
          <Text wrap="truncate-end">{" ".repeat(TOOL_GAP)}</Text>
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        {labelButton(ui, {
          key: `tool-${use.tool_use_id}`,
          label: shownTarget(use, view.cwd, Math.max(1, view.width - leadCells)),
          onPress: () => view.openCall(use.tool_use_id),
        })}
      </Box>
    </Box>
  );
}

function shownTarget(use: ToolUseSummary, cwd: string, cells: number): string {
  const target = targetOf(use.input);
  if (target === "") return use.tool;
  return isPathTool(use.tool)
    ? clipStart(relativePath(target, cwd), cells)
    : clipEnd(target, cells);
}
