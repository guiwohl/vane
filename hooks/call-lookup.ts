import type { SessionMessage } from "claude-code";

import type { CallRecord } from "../types";
import { callRecord } from "./activity-calls";
import { UNMEASURED_MS } from "./activity-track";
import { targetOf } from "./tools";

export function recordOf(
  calls: CallRecord[],
  messages: SessionMessage[],
  callId: string,
): CallRecord | undefined {
  const stored = calls.find((call) => call.id === callId);
  if (stored) return stored;
  const use = messages
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
