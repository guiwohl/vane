import { atom, update } from "claude-code";
import type { BackgroundTaskSummary, EngineInterface, On } from "claude-code";

import type { BackgroundWork } from "../types";
import { reconciled } from "./background-model";

const backgroundAtom = atom({ plugin: "vane", key: "background" } as const, [] as BackgroundWork[]);

export function trackBackground(on: On): void {
  // prompt-track already owns the unmatched Stop hook, and the engine refuses a second one
  on("classic.Stop", { hook_event_name: "Stop" }, async ($, e, next) => {
    await reconcile($, e.background_tasks);
    return next(e);
  });

  on("classic.SubagentStop", async ($, e, next) => {
    await reconcile($, e.background_tasks);
    return next(e);
  });

  on("classic.SessionStart", { source: ["clear", "resume", "fork"] }, async ($, e, next) => {
    await update($, backgroundAtom, () => []);
    return next(e);
  });
}

async function reconcile(
  $: EngineInterface,
  tasks: BackgroundTaskSummary[] | undefined,
): Promise<void> {
  if (tasks === undefined) return;
  const now = await $.clock.now();
  await update($, backgroundAtom, (current) => reconciled(current, tasks, now));
}
