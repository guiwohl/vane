import { palette } from "./palette";
import type { ToolKind } from "./tools";

export type PaneInk = {
  fill: string | undefined;
  text: string | undefined;
  rule: string;
  meterEmpty: string;
  section: string;
  muted: string;
  tool: string | undefined;
  ok: string;
  failed: string;
  alert: string;
  onAlert: string | undefined;
  mix: Record<ToolKind, string>;
  hues: readonly string[];
  isRecoloured: boolean;
};

const themeInk: PaneInk = {
  fill: undefined,
  text: palette.text,
  rule: palette.rule,
  meterEmpty: palette.meterEmpty,
  section: palette.section,
  muted: palette.muted,
  tool: palette.tool,
  ok: palette.ok,
  failed: palette.failed,
  alert: palette.alert,
  onAlert: palette.button,
  mix: {
    Read: palette.tool,
    Edit: palette.ok,
    Bash: palette.alert,
    Search: palette.keyword,
    Web: palette.button,
    Agent: palette.user,
    Other: palette.muted,
  },
  hues: [palette.tool, palette.ok, palette.alert, palette.keyword, palette.button, palette.user],
  isRecoloured: false,
};

const lightHues = [
  "ansi256(19)",
  "ansi256(22)",
  "ansi256(130)",
  "ansi256(90)",
  "ansi256(30)",
  "ansi256(53)",
];

const lightInk: PaneInk = {
  fill: undefined,
  text: palette.text,
  rule: palette.rule,
  meterEmpty: palette.meterEmpty,
  section: palette.section,
  muted: palette.muted,
  tool: palette.text,
  ok: "ansi256(22)",
  failed: "ansi256(124)",
  alert: "ansi256(94)",
  onAlert: "ansi256(231)",
  mix: {
    Read: "ansi256(19)",
    Edit: "ansi256(22)",
    Bash: "ansi256(130)",
    Search: "ansi256(90)",
    Web: "ansi256(30)",
    Agent: "ansi256(53)",
    Other: palette.muted,
  },
  hues: lightHues,
  isRecoloured: true,
};

const lightAnsiHues = [
  "ansi256(19)",
  "ansi256(22)",
  "ansi256(58)",
  "ansi256(90)",
  "ansi256(23)",
  "ansi256(52)",
];

const lightAnsiInk: PaneInk = {
  fill: undefined,
  text: palette.text,
  rule: palette.rule,
  meterEmpty: palette.meterEmpty,
  section: palette.section,
  muted: palette.text,
  tool: palette.text,
  ok: "ansi256(22)",
  failed: "ansi256(88)",
  alert: "ansi256(58)",
  onAlert: "ansi256(231)",
  mix: {
    Read: "ansi256(19)",
    Edit: "ansi256(22)",
    Bash: "ansi256(58)",
    Search: "ansi256(90)",
    Web: "ansi256(23)",
    Agent: "ansi256(52)",
    Other: palette.text,
  },
  hues: lightAnsiHues,
  isRecoloured: true,
};

const darkAnsiHues = [
  "ansi256(159)",
  "ansi256(157)",
  "ansi256(227)",
  "ansi256(224)",
  "ansi256(229)",
  "ansi256(195)",
];

const darkAnsiInk: PaneInk = {
  fill: undefined,
  text: palette.text,
  rule: palette.rule,
  meterEmpty: palette.meterEmpty,
  section: palette.section,
  muted: palette.text,
  tool: palette.text,
  ok: "ansi256(157)",
  failed: "ansi256(224)",
  alert: "ansi256(227)",
  onAlert: "ansi256(16)",
  mix: {
    Read: "ansi256(159)",
    Edit: "ansi256(157)",
    Bash: "ansi256(227)",
    Search: "ansi256(224)",
    Web: "ansi256(229)",
    Agent: "ansi256(195)",
    Other: palette.text,
  },
  hues: darkAnsiHues,
  isRecoloured: true,
};

const TERMINAL_RED = "ansi256(1)";
const TERMINAL_GREEN = "ansi256(2)";
const TERMINAL_YELLOW = "ansi256(3)";
const TERMINAL_BLUE = "ansi256(4)";
const TERMINAL_MAGENTA = "ansi256(5)";
const TERMINAL_CYAN = "ansi256(6)";
const TERMINAL_GREY = "ansi256(8)";

const autoInk: PaneInk = {
  fill: undefined,
  text: undefined,
  rule: TERMINAL_GREY,
  meterEmpty: TERMINAL_GREY,
  section: TERMINAL_BLUE,
  muted: TERMINAL_GREY,
  tool: undefined,
  ok: TERMINAL_GREEN,
  failed: TERMINAL_RED,
  alert: TERMINAL_YELLOW,
  onAlert: "ansi256(0)",
  mix: {
    Read: TERMINAL_BLUE,
    Edit: TERMINAL_GREEN,
    Bash: TERMINAL_YELLOW,
    Search: TERMINAL_MAGENTA,
    Web: TERMINAL_CYAN,
    Agent: TERMINAL_RED,
    Other: TERMINAL_GREY,
  },
  hues: [
    TERMINAL_BLUE,
    TERMINAL_GREEN,
    TERMINAL_YELLOW,
    TERMINAL_MAGENTA,
    TERMINAL_CYAN,
    TERMINAL_RED,
  ],
  isRecoloured: true,
};

let current = themeInk;

export function inkFor(theme: string): PaneInk {
  if (theme === "auto") return autoInk;
  if (theme === "light-ansi") return lightAnsiInk;
  if (theme === "dark-ansi") return darkAnsiInk;
  if (theme.startsWith("light")) return lightInk;
  return themeInk;
}

export function notePaneTheme(theme: string): void {
  current = inkFor(theme);
}

export function paneInk(): PaneInk {
  return current;
}
