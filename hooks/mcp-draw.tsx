import type {
  ContextMcpTool,
  ElementTable,
  RenderElement,
  SessionContextBreakdown,
} from "claude-code";

import { singleLine } from "./format";
import { mcpCommandName } from "./mcp-name";
import { labelButton, plural } from "./pane-kit";
import { paneInk } from "./pane-ink";
import { byOriginThenUses, countCells, countColumn, originWord } from "./row-kit";
import type { Origin } from "./row-kit";
import { scopeOf, serversOf } from "./servers";
import type { McpAction, McpScope, ScopeIndex, Server } from "./servers";
import { rankedUses } from "./use-counts";
import type { UseEntry } from "./use-counts";

type Ui = ElementTable;

export type McpView = {
  context: SessionContextBreakdown | null;
  width: number;
  disabledServers: string[];
  scopes: ScopeIndex;
  queuedServers: string[];
  openServers: Set<string>;
  toggle: (server: string) => void;
  act: (action: McpAction, server: string) => void;
  toolUses: Record<string, number>;
  clearUses: () => void;
};

type Card = {
  name: string;
  scope: McpScope;
  detail: string;
  uses: number;
  isLive: boolean;
  actions: McpAction[];
  tools: UseEntry[];
};

const SCOPE_ORIGINS: Record<McpScope, Origin> = {
  project: "project",
  local: "project",
  user: "global",
  claudeai: "other",
  dynamic: "other",
};
const ACTIONS_INDENT_CELLS = 2;
const OPEN_GLYPH = "▾";
const FOLDED_GLYPH = "▸";
const CLEAR_LABEL = "clear usage stats";

export function mcpServerCount(view: McpView): number {
  return view.context === null ? 0 : cardsOf(serversOf(view.context.mcpTools), view).length;
}

export function mcpTab(ui: Ui, view: McpView): RenderElement {
  const { Box, Text } = ui;
  const { context } = view;
  if (context === null) {
    return (
      <Text color={paneInk().muted} wrap="truncate-end">
        no MCP data yet
      </Text>
    );
  }
  const cards = byOriginThenUses(
    cardsOf(serversOf(context.mcpTools), view),
    (card) => SCOPE_ORIGINS[card.scope],
    (card) => card.uses,
  );
  if (cards.length === 0) {
    return (
      <Text color={paneInk().muted} wrap="truncate-end">
        no MCP servers
      </Text>
    );
  }
  const detailCells = Math.max(...cards.map((card) => card.detail.length));
  const cells = countCells(cards.map((card) => card.uses));
  return (
    <Box flexDirection="column" width={view.width}>
      {titleRow(ui, view)}
      <Box height={1} />
      {cards.flatMap((card) =>
        cardRows(ui, card, {
          view,
          detailCells,
          cells,
          isOpen: view.openServers.has(card.name),
        }),
      )}
    </Box>
  );
}

function titleRow(ui: Ui, view: McpView): RenderElement {
  const { Box, Button, Text } = ui;
  const hasUses = Object.values(view.toolUses).some((uses) => uses > 0);
  return (
    <Box flexDirection="row" width={view.width} columnGap={1}>
      <Box flexGrow={1}>
        <Text bold color={paneInk().text} wrap="truncate-end">
          Manage MCP servers
        </Text>
      </Box>
      {hasUses && (
        <Box flexShrink={0}>
          <Button key="clear-uses" label={CLEAR_LABEL} plain dimColor onPress={view.clearUses} />
        </Box>
      )}
    </Box>
  );
}

function cardsOf(live: Server[], view: McpView): Card[] {
  const named = live.map((server) => ({
    ...server,
    name: singleLine(mcpCommandName(server.name)),
  }));
  const liveNames = new Set(named.map((server) => server.name));
  const disabled = view.disabledServers.filter((name) => !liveNames.has(name));
  return [
    ...named.map((server) => {
      const tools = toolRowsOf(view.context?.mcpTools ?? [], server.name, view.toolUses);
      const uses = tools.reduce((sum, tool) => sum + tool.uses, 0);
      return {
        name: server.name,
        scope: scopeOf(server.name, view.scopes),
        detail: `${server.tools} ${plural("tool", server.tools)}`,
        uses,
        isLive: true,
        actions: ["reconnect", "disable"] as McpAction[],
        tools,
      };
    }),
    ...disabled.map((name) => ({
      name,
      scope: scopeOf(name, view.scopes),
      detail: "",
      uses: usesOfServer(name, view.toolUses),
      isLive: false,
      actions: ["enable"] as McpAction[],
      tools: [],
    })),
  ].map((card) =>
    view.queuedServers.includes(card.name) ? { ...card, detail: "queued", actions: [] } : card,
  );
}

function usesOfServer(serverName: string, toolUses: Record<string, number>): number {
  const prefix = `mcp__${serverName}__`;
  return Object.entries(toolUses)
    .filter(([tool]) => tool.startsWith(prefix))
    .reduce((sum, [, uses]) => sum + uses, 0);
}

function toolRowsOf(
  tools: ContextMcpTool[],
  serverName: string,
  toolUses: Record<string, number>,
): UseEntry[] {
  const ofServer = tools.filter((tool) => mcpCommandName(tool.serverName) === serverName);
  return rankedUses(
    Object.fromEntries(
      ofServer.map((tool) => [
        tool.name.replace(`mcp__${tool.serverName}__`, ""),
        toolUses[tool.name] ?? 0,
      ]),
    ),
  );
}

type RowLook = { view: McpView; detailCells: number; cells: number; isOpen: boolean };

function cardRows(
  ui: Ui,
  card: Card,
  { view, detailCells, cells, isOpen }: RowLook,
): RenderElement[] {
  const { Box, Button, Text } = ui;
  const toggle = () => view.toggle(card.name);
  const rows: RenderElement[] = [
    <Box key={`${card.name}-name`} flexDirection="row" width={view.width} height={1} columnGap={1}>
      {countColumn(ui, card.uses, cells)}
      <Button
        key={`${card.name}-toggle`}
        label={isOpen ? OPEN_GLYPH : FOLDED_GLYPH}
        plain
        dimColor
        onPress={toggle}
      />
      <Text color={card.isLive ? paneInk().ok : paneInk().muted} wrap="truncate-end">
        {card.isLive ? "✔" : "○"}
      </Text>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        {labelButton(ui, { key: card.name, label: card.name, onPress: toggle })}
      </Box>
      <Box width={detailCells} flexShrink={0} justifyContent="flex-end">
        <Text color={paneInk().muted} wrap="truncate-end">
          {card.detail}
        </Text>
      </Box>
      {originWord(ui, SCOPE_ORIGINS[card.scope])}
    </Box>,
  ];
  if (!isOpen) return rows;
  if (card.actions.length > 0) {
    rows.push(
      <Box
        key={`${card.name}-actions`}
        flexDirection="row"
        columnGap={2}
        marginLeft={cells + 1 + ACTIONS_INDENT_CELLS}
        height={1}
        overflow="hidden"
      >
        {card.actions.map((action) => (
          <Button
            key={`${card.name}-${action}`}
            label={action}
            plain
            dimColor
            onPress={() => view.act(action, card.name)}
          />
        ))}
      </Box>,
    );
  }
  return [...rows, ...toolRows(ui, card, view.width, cells + 1 + ACTIONS_INDENT_CELLS)];
}

function toolRows(ui: Ui, card: Card, width: number, indent: number): RenderElement[] {
  const { Box, Text } = ui;
  const labels = card.tools.map((tool) => `${tool.uses} ${plural("use", tool.uses)}`);
  const usesCells = Math.max(0, ...labels.map((label) => label.length));
  return card.tools.map((tool, index) => (
    <Box
      key={`${card.name}-tool-${tool.name}`}
      flexDirection="row"
      width={width - indent}
      height={1}
      marginLeft={indent}
      columnGap={1}
    >
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text color={tool.uses > 0 ? paneInk().text : paneInk().muted} wrap="truncate-end">
          {tool.name}
        </Text>
      </Box>
      <Box width={usesCells} flexShrink={0} justifyContent="flex-end">
        <Text color={paneInk().muted} wrap="truncate-end">
          {labels[index]}
        </Text>
      </Box>
    </Box>
  ));
}
