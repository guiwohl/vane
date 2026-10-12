import type { BackgroundTaskSummary } from "claude-code";

import type { BackgroundWork } from "../types";
import { singleLine } from "./format";

const ENDED = new Set(["completed", "failed", "killed"]);

export function labelOf(task: BackgroundTaskSummary): string {
  const named = [
    task.command,
    [task.server, task.tool].filter(Boolean).join(" "),
    task.name,
    task.agent_type,
  ].find((text) => text !== undefined && singleLine(text) !== "");
  return singleLine(named ?? task.description);
}

export function reconciled(
  current: BackgroundWork[],
  tasks: BackgroundTaskSummary[],
  now: number,
): BackgroundWork[] {
  return tasks
    .filter((task) => !ENDED.has(task.status.toLowerCase()))
    .map((task) => ({
      id: task.id,
      type: task.type,
      label: labelOf(task),
      startedAt: current.find((known) => known.id === task.id)?.startedAt ?? now,
    }));
}
