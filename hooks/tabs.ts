import type { On } from "claude-code";

import { ACTIVITY_TAB, registerActivityTab } from "./activity-tab";
import { AGENTS_TAB, registerAgentsTab } from "./agents-tab";
import { CONTEXT_TAB, registerContextTab } from "./context-tab";
import { registerSetupTab, SETUP_TAB } from "./setup-tab";
import { registerSpendTab, SPEND_TAB } from "./spend-tab";
import type { TabEntry } from "./tab-bar";

export const TABS: [TabEntry, ...TabEntry[]] = [
  ACTIVITY_TAB,
  AGENTS_TAB,
  CONTEXT_TAB,
  SETUP_TAB,
  SPEND_TAB,
];

export function registerTabs(on: On): void {
  registerActivityTab(on);
  registerAgentsTab(on);
  registerContextTab(on);
  registerSetupTab(on);
  registerSpendTab(on);
}
