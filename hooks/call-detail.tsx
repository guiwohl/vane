import type { ElementTable, RenderElement } from "claude-code";

import type { CallRecord } from "../types";
import { UNMEASURED_MS } from "./activity-track";
import { formatDuration } from "./format";
import { button, header, mutedLine, paneHeaderLook, statusDot } from "./pane-kit";
import { paneInk } from "./pane-ink";
import { stickyWindow } from "./sticky-window";
import { TAB_BAR_ROWS } from "./tab-bar";
import { displayWidth, wrapPlain } from "./text-width";
import { isPathTool, kindOf } from "./tools";

type Ui = ElementTable;

export type CallDetailView = {
  width: number;
  offset: number;
  bodyRows: number;
  isRunning: boolean;
  closeCall: () => void;
};

type Section = "Input" | "Output";

type LineRow = { kind: "line"; section: Section; text: string; number: number };

type DetailRow = { kind: "title"; section: Section } | LineRow | { kind: "note"; text: string };

const HEADER_ROWS = 1;

export function callDetails(ui: Ui, call: CallRecord, view: CallDetailView): RenderElement {
  const status = view.isRunning ? "running" : call.isErrored ? "failed" : "done";
  return stickyWindow(ui, {
    offset: view.offset,
    bodyRows: view.bodyRows,
    rowsAbove: TAB_BAR_ROWS,
    header: statusRow(ui, call, status, view),
    headerRows: HEADER_ROWS,
    rows: detailRows(call, view),
    drawRows: (visible, firstIndex) => drawRows(ui, call, visible, firstIndex, view.width),
  });
}

function statusRow(
  ui: Ui,
  call: CallRecord,
  status: "running" | "failed" | "done",
  view: CallDetailView,
): RenderElement {
  const { Box, Text } = ui;
  const dot = statusDot(status);
  return (
    <Box flexDirection="row" columnGap={1} height={HEADER_ROWS}>
      {button(ui, { key: "back", label: "back", onPress: view.closeCall })}
      <Text color={dot.color} wrap="truncate-end">
        {dot.text}
      </Text>
      <Text bold color={dot.color} wrap="truncate-end">
        {status}
      </Text>
      <Text bold color={paneInk().tool} wrap="truncate-end">
        {call.tool}
      </Text>
      <Text color={paneInk().muted} wrap="truncate-end">
        {call.ms === UNMEASURED_MS ? "" : formatDuration(call.ms)}
      </Text>
    </Box>
  );
}

function detailRows(call: CallRecord, view: CallDetailView): DetailRow[] {
  const output: DetailRow[] =
    call.output === ""
      ? [{ kind: "note", text: view.isRunning ? "running, no output yet" : "no output" }]
      : sectionLines("Output", call.output, view.width);
  return [
    { kind: "title", section: "Input" },
    ...sectionLines("Input", call.input, view.width),
    { kind: "title", section: "Output" },
    ...output,
  ];
}

function sectionLines(section: Section, text: string, width: number): DetailRow[] {
  return wrapToWidth(text, width).map((row, i): LineRow => ({
    kind: "line",
    section,
    text: row,
    number: i + 1,
  }));
}

function wrapToWidth(text: string, width: number): string[] {
  return text
    .replaceAll("\t", "  ")
    .split("\n")
    .flatMap((line) => wrapIndented(line, width));
}

function wrapIndented(line: string, width: number): string[] {
  if (displayWidth(line) <= width) return [line];
  const indent = line.length - line.trimStart().length;
  const prefix = line.slice(0, indent);
  return wrapPlain(line.slice(indent), width - indent).map((row) => `${prefix}${row}`);
}

function isHighlighted(call: CallRecord): boolean {
  return isPathTool(call.tool) || kindOf(call.tool) === "Bash";
}

function drawRows(
  ui: Ui,
  call: CallRecord,
  visible: DetailRow[],
  firstIndex: number,
  width: number,
): RenderElement[] {
  const { Box, Code, Text } = ui;
  const elements: RenderElement[] = [];
  let run: LineRow[] = [];
  const flush = () => {
    const first = run[0];
    if (first === undefined) return;
    elements.push(
      <Code
        key={`${first.section}${first.number}`}
        source={run.map((row) => row.text).join("\n")}
        {...(isPathTool(call.tool) ? { path: call.target } : { language: "bash" })}
        wrap="truncate-end"
      />,
    );
    run = [];
  };
  visible.forEach((row, i) => {
    if (row.kind === "line" && isHighlighted(call)) {
      run.push(row);
      return;
    }
    flush();
    const key = `row${firstIndex + i}`;
    if (row.kind === "title") {
      elements.push(<Box key={key}>{header(ui, row.section, paneHeaderLook(), width)}</Box>);
    } else if (row.kind === "note") {
      elements.push(<Box key={key}>{mutedLine(ui, row.text)}</Box>);
    } else {
      elements.push(
        <Text key={key} color={paneInk().text} wrap="truncate-end">
          {row.text === "" ? " " : row.text}
        </Text>,
      );
    }
  });
  flush();
  return elements;
}
