import { atom, read, update } from "claude-code";
import type { EngineInterface, On } from "claude-code";

import type { AgentTree, CallRecord } from "../types";
import { agentsTab } from "./agents-draw";
import { runningOnly } from "./agents-model";
import { PANE } from "./pane-tab";
import { isShownTab } from "./shown-tab";

export const AGENTS_TAB = { id: "agents", label: "Agents" };

const agentsAtom = atom({ plugin: "vane", key: "agents" } as const, {} as AgentTree);
const openAgentAtom = atom({ plugin: "vane", key: "openAgent" } as const, null as string | null);
const callsAtom = atom({ plugin: "vane", key: "calls" } as const, [] as CallRecord[]);
const openCallAtom = atom({ plugin: "vane", key: "openCall" } as const, null as string | null);
const sessionUsdAtom = atom({ plugin: "vane", key: "sessionUsd" } as const, null as number | null);

export function registerAgentsTab(on: On): void {
  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e, next) => {
    if (!isShownTab(AGENTS_TAB.id)) return next(e);
    const [allAgents, sessionUsd, model, now, openAgentId, calls, cwd, openCallId] =
      await Promise.all([
        read($, agentsAtom),
        read($, sessionUsdAtom),
        $.session.model(),
        $.clock.now(),
        read($, openAgentAtom),
        read($, callsAtom),
        $.session.cwd(),
        read($, openCallAtom),
      ]);
    const found = openAgentId === null ? [] : await $.session.messages({ agentId: openAgentId });
    const messages = Array.isArray(found) ? found : [];
    return agentsTab($.ui.resolve(e), {
      agents: runningOnly(allAgents),
      sessionUsd,
      model,
      now,
      width: e.props.bodyColumns,
      openAgentId,
      messages,
      calls,
      cwd,
      openCallId,
      openCall: (id) => void update($, openCallAtom, () => id),
      closeCall: () => void update($, openCallAtom, () => null),
      openAgent: (id) => void openAgent($, id),
      closeAgent: () => void closeAgent($),
    });
  });
}

async function openAgent($: EngineInterface, agentId: string): Promise<void> {
  await update($, openAgentAtom, () => agentId);
  await $.ui.scroll({ in: PANE, to: "end" }).catch(() => ({}));
}

async function closeAgent($: EngineInterface): Promise<void> {
  await update($, openAgentAtom, () => null);
}
