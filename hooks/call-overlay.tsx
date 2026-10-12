import { atom, read, update } from "claude-code";
import type { EngineInterface, On, SessionMessage } from "claude-code";

import type { CallRecord, StartedCall } from "../types";
import { callRecord } from "./activity-calls";
import { AGENTS_TAB } from "./agents-tab";
import { callDetails } from "./call-detail";
import { UNMEASURED_MS } from "./activity-track";
import { failureText } from "./command-failure";
import { PANE } from "./pane-tab";
import { isShownTab } from "./shown-tab";
import { targetOf } from "./tools";

const callsAtom = atom({ plugin: "vane", key: "calls" } as const, [] as CallRecord[]);
const runningAtom = atom({ plugin: "vane", key: "running" } as const, [] as StartedCall[]);
const openCallAtom = atom({ plugin: "vane", key: "openCall" } as const, null as string | null);
const openAgentAtom = atom({ plugin: "vane", key: "openAgent" } as const, null as string | null);

export function registerCallOverlay(on: On): void {
  on("command.run", { command: "session" }, async ($, e, next) => {
    try {
      await update($, openCallAtom, () => null);
      return await next(e);
    } catch (error) {
      const text = failureText(error);
      $.ui.log(text, { to: "debug" });
      return { text };
    }
  });

  on("ui.close", { id: PANE }, async ($, e, next) => {
    if (e.origin.kind !== "person") return next(e);
    if ((await read($, openCallAtom)) !== null) {
      await update($, openCallAtom, () => null);
      return { value: undefined };
    }
    if (isShownTab(AGENTS_TAB.id) && (await read($, openAgentAtom)) !== null) {
      await update($, openAgentAtom, () => null);
      return { value: undefined };
    }
    return next(e);
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e, next) => {
    const openCallId = await read($, openCallAtom);
    if (openCallId === null) return next(e);
    const [call, running] = await Promise.all([openedCall($, openCallId), read($, runningAtom)]);
    if (!call) return next(e);
    return callDetails($.ui.resolve(e), call, {
      width: e.props.bodyColumns,
      offset: e.props.scroll.offset,
      bodyRows: e.props.scroll.bodyRows,
      isRunning: running.some((one) => one.callId === call.id),
      closeCall: () => void update($, openCallAtom, () => null),
    });
  });
}

async function openedCall($: EngineInterface, callId: string): Promise<CallRecord | undefined> {
  const stored = (await read($, callsAtom)).find((call) => call.id === callId);
  if (stored) return stored;
  const use = (await messagesOf($))
    .flatMap((message) => message.toolUses)
    .find((one) => one.tool_use_id === callId);
  if (!use) return undefined;
  const entry = {
    id: use.tool_use_id,
    tool: use.tool,
    target: targetOf(use.input),
    ms: use.durationMs ?? UNMEASURED_MS,
    isErrored: use.isError === true,
    added: 0,
    removed: 0,
  };
  return callRecord(use.input, entry, { text: use.text }, undefined);
}

async function messagesOf($: EngineInterface): Promise<SessionMessage[]> {
  const agentId = await read($, openAgentAtom);
  const [main, agent] = await Promise.all([
    $.session.messages(),
    agentId === null ? [] : $.session.messages({ agentId }),
  ]);
  return [...main, ...(Array.isArray(agent) ? agent : [])];
}
