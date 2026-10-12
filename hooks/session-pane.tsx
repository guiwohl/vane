import { atom, read, update } from "claude-code";
import type { EngineInterface, On } from "claude-code";

import { failureText } from "./command-failure";
import { PANE } from "./pane-tab";
import { accentOf } from "./session-color";
import { notePaneTheme, paneInk } from "./pane-ink";
import { noteShownTab } from "./shown-tab";
import { tabBar } from "./tab-bar";
import { TABS } from "./tabs";

const BODY_PADDING = 1;

const sessionColorAtom = atom({ plugin: "vane", key: "sessionColor" } as const, "default");
const tabAtom = atom({ plugin: "vane", key: "tab" } as const, "activity");
const themeAtom = atom({ plugin: "vane", key: "theme" } as const, "dark");

export function registerSessionPane(on: On): void {
  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e, next) => {
    const [tab, theme, color] = await Promise.all([
      read($, tabAtom),
      read($, themeAtom),
      read($, sessionColorAtom),
    ]);
    noteShownTab(tab);
    notePaneTheme(theme);
    const accent = accentOf(color);
    const width = e.props.bodyColumns;
    const body = await next({ ...e, props: { ...e.props, bodyColumns: width - BODY_PADDING } });
    const ui = $.ui.resolve(e);
    const { Box } = ui;
    const { fill } = paneInk();
    return (
      <Box
        flexDirection="column"
        width={width}
        minHeight={fill === undefined ? undefined : e.props.scroll.bodyRows}
        backgroundColor={fill}
      >
        {tabBar(ui, TABS, tab, (id) => void update($, tabAtom, () => id), width, accent)}
        <Box flexDirection="column" paddingLeft={BODY_PADDING} width={width}>
          {body}
        </Box>
      </Box>
    );
  });
}

export function registerSessionCommand(on: On): void {
  on("session.start", { isInteractive: true }, async ($, e, next) => {
    await $.command.register({ name: "session", description: "Toggle the Session side pane" });
    await $.command.register({ name: "hud", description: "Toggle the Session side pane" });
    void openPane($);
    return next(e);
  });

  on("classic.SessionStart", { source: ["clear", "resume", "fork"] }, async ($, e, next) => {
    void openPane($);
    return next(e);
  });

  on("command.run", { command: ["session", "hud"] }, async ($) => {
    try {
      await togglePane($);
      return {};
    } catch (error) {
      const text = failureText(error);
      $.ui.log(text, { to: "debug" });
      return { text };
    }
  });
}

async function togglePane($: EngineInterface): Promise<void> {
  const open = (await $.ui.panes()).some((pane) => pane.id === PANE);
  if (open) {
    await $.ui.close({ id: PANE });
    return;
  }
  await update($, tabAtom, () => TABS[0].id);
  await openPane($);
}

async function openPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: "Session", closeOnEscape: true });
}
