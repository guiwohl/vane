import type { ElementTable, RenderElement, SessionMessage } from "claude-code";

import type { AgentNode, AgentTree, CallRecord } from "../types";
import type { TreeRow } from "./agents-model";
import { titleOf, visibleRows } from "./agents-model";
import { formatDuration, formatTokens, shortModel } from "./format";
import { agentTranscript } from "./agent-transcript";
import { bar, gapRow, header, labelButton, paneHeaderLook, paneRow, statusDot } from "./pane-kit";
import { paneInk } from "./pane-ink";
import { guideBetween, guideUnder, treeGlyphs } from "./tree-glyphs";

type Ui = ElementTable;

export type AgentsView = {
  agents: AgentTree;
  model: string;
  sessionUsd: number | null;
  now: number;
  width: number;
  openAgentId: string | null;
  messages: SessionMessage[];
  calls: CallRecord[];
  cwd: string;
  openCallId: string | null;
  openCall: (id: string) => void;
  closeCall: () => void;
  openAgent: (id: string) => void;
  closeAgent: () => void;
};

type Shown = { row: TreeRow; prefix: string; spacer: string; continuation: string };

type Spender = { node: AgentNode; tokens: number };

const SPEND_LIMIT = 6;
const SPEND_BAR_CELLS = 6;
const DETAILS_INDENT = "  ";

export function agentsTab(ui: Ui, view: AgentsView): RenderElement {
  const { Box, Text } = ui;
  const open = view.openAgentId === null ? undefined : view.agents[view.openAgentId];
  if (open) {
    return agentTranscript(ui, open, {
      messages: view.messages,
      calls: view.calls,
      cwd: view.cwd,
      width: view.width,
      openCallId: view.openCallId,
      openCall: view.openCall,
      closeCall: view.closeCall,
      close: view.closeAgent,
    });
  }
  const rows = visibleRows(view.agents);
  const spenders = rankedSpenders(view.agents).slice(0, SPEND_LIMIT);
  return (
    <Box flexDirection="column">
      {mainRow(ui, view)}
      {rows.length === 0 ? (
        <Text color={paneInk().muted} wrap="truncate-end">
          no agents running
        </Text>
      ) : null}
      {shownRows(rows).map((shown) => agentCard(ui, shown, view))}
      {spenders.length > 0 ? gapRow(ui, "gap-spend", " ", paneInk().rule) : null}
      {spendSection(ui, spenders, view)}
    </Box>
  );
}

function rankedSpenders(agents: AgentTree): Spender[] {
  return Object.values(agents)
    .map((node) => ({ node, tokens: node.tokensIn + node.tokensOut }))
    .filter((spender) => spender.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);
}

function shownRows(rows: TreeRow[]): Shown[] {
  const glyphs = treeGlyphs(rows.map((row) => ({ depth: row.depth + 1, isLast: row.isLast })));
  return rows.map((row, i) => {
    const glyph = glyphs[i] ?? "";
    const hasChildren = (rows[i + 1]?.depth ?? 0) > row.depth;
    return {
      row,
      prefix: `${glyph} `,
      spacer: guideBetween(glyph),
      continuation: `${guideUnder(glyph, row.isLast)}${hasChildren ? "│" : " "}${DETAILS_INDENT}`,
    };
  });
}

function mainRow(ui: Ui, view: AgentsView): RenderElement {
  const { Box, Text } = ui;
  return (
    <Box flexDirection="row" width={view.width} height={1} columnGap={1}>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">
          <Text color={paneInk().text} bold wrap="truncate-end">
            main
          </Text>
          <Text color={paneInk().muted} wrap="truncate-end">
            {` · ${shortModel(view.model)}`}
          </Text>
        </Text>
      </Box>
      {view.sessionUsd === null ? null : (
        <Box flexShrink={0}>
          <Text color={paneInk().muted} wrap="truncate-end">
            {`$${view.sessionUsd.toFixed(2)}`}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function agentCard(ui: Ui, shown: Shown, view: AgentsView): RenderElement {
  const { Box } = ui;
  const { node } = shown.row;
  return (
    <Box key={node.id} flexDirection="column">
      {gapRow(ui, `gap-${node.id}`, shown.spacer, paneInk().rule)}
      {titleRow(ui, shown, view)}
      {detailLines(node, view.now).map((line, i) =>
        paneRow(ui, {
          key: `${node.id}-${i}`,
          prefix: shown.continuation,
          middle: { text: line, color: paneInk().muted },
          middleWrap: "truncate-end",
          width: view.width,
        }),
      )}
    </Box>
  );
}

function titleRow(ui: Ui, shown: Shown, view: AgentsView): RenderElement {
  const { Box, Text } = ui;
  const { node } = shown.row;
  const dot = statusDot("running");
  return (
    <Box key={`title-${node.id}`} flexDirection="row" width={view.width} height={1} columnGap={1}>
      <Box flexShrink={0}>
        <Text wrap="truncate-end">
          <Text color={paneInk().rule} wrap="truncate-end">
            {shown.prefix}
          </Text>
          <Text color={dot.color} wrap="truncate-end">
            {dot.text}
          </Text>
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        {labelButton(ui, {
          key: `agent-${node.id}`,
          label: titleOf(node),
          onPress: () => view.openAgent(node.id),
        })}
      </Box>
    </Box>
  );
}

function spendSection(ui: Ui, spenders: Spender[], view: AgentsView): RenderElement | null {
  const { Box } = ui;
  const largest = spenders[0]?.tokens ?? 0;
  if (largest === 0) return null;
  return (
    <Box flexDirection="column">
      {header(ui, "Spend", paneHeaderLook(), view.width)}
      {spenders.map(({ node, tokens }) => spendRow(ui, node, tokens, largest, view))}
    </Box>
  );
}

function spendRow(
  ui: Ui,
  node: AgentNode,
  tokens: number,
  largest: number,
  view: AgentsView,
): RenderElement {
  const { Box, Text } = ui;
  return (
    <Box key={node.id} flexDirection="row" width={view.width} height={1} columnGap={1}>
      {bar(ui, tokens, largest, SPEND_BAR_CELLS, paneInk().tool)}
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text color={paneInk().text} wrap="truncate-end">
          {titleOf(node)}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text color={paneInk().muted} wrap="truncate-end">
          {formatTokens(tokens)}
        </Text>
      </Box>
    </Box>
  );
}

function detailLines(node: AgentNode, now: number): string[] {
  const tool = node.running[0];
  const lines = [
    joined([node.type, shortModel(node.model), node.effort ?? ""]),
    joined([
      formatDuration(Math.max(0, now - node.startedAt)),
      node.ctxTokens > 0 ? `ctx ${formatTokens(node.ctxTokens)}` : "",
      tool ? `${tool.tool}: ${tool.target}`.replace(/: $/, "") : "",
    ]),
  ];
  return node.branch === undefined
    ? lines
    : [...lines, joined([`⎇ ${node.branch}`, node.worktree ?? ""])];
}

function joined(parts: string[]): string {
  return parts.filter((part) => part !== "").join(" · ");
}
