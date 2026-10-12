import { atom, read, update } from "claude-code";
import type { EngineInterface, On, Timer } from "claude-code";

import type {
  Activity,
  AgentTree,
  BackgroundWork,
  CallRecord,
  RereadState,
  StartedCall,
  UsageSnap,
} from "../types";
import { activityTab } from "./activity-draw";
import { isRunning } from "./agents-model";
import { recordOf } from "./call-lookup";
import { withoutCleared } from "./clear-kit";
import { liveEntries } from "./live-draw";
import { PANE } from "./pane-tab";
import { clearedRing, emptyRing } from "./series-ring";
import { isShownTab } from "./shown-tab";
import { TAB_BAR_ROWS } from "./tab-bar";

export const ACTIVITY_TAB = { id: "activity", label: "Overview" };

const TICK_MS = 1000;

let ticker: Timer | undefined;

const callsAtom = atom({ plugin: "vane", key: "calls" } as const, [] as CallRecord[]);
const activityAtom = atom({ plugin: "vane", key: "activity" } as const, [] as Activity[]);
const clearedAtom = atom({ plugin: "vane", key: "activityCleared" } as const, {
  ids: [] as string[],
});
const seriesAtom = atom({ plugin: "vane", key: "series" } as const, emptyRing());
const usageAtom = atom(
  { plugin: "vane", key: "usage" } as const,
  { context: null, limits: [], tokens: null, window: null } as UsageSnap,
);

const rereadAtom = atom(
  { plugin: "vane", key: "reread" } as const,
  { seen: [], suppressed: 0 } as RereadState,
);

const backgroundAtom = atom({ plugin: "vane", key: "background" } as const, [] as BackgroundWork[]);
const openCallAtom = atom({ plugin: "vane", key: "openCall" } as const, null as string | null);
const runningAtom = atom({ plugin: "vane", key: "running" } as const, [] as StartedCall[]);
const agentsAtom = atom({ plugin: "vane", key: "agents" } as const, {} as AgentTree);
const sessionUsdAtom = atom({ plugin: "vane", key: "sessionUsd" } as const, null as number | null);

export function registerActivityTab(on: On): void {
  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e, next) => {
    if (!isShownTab(ACTIVITY_TAB.id)) {
      stopTicking();
      return next(e);
    }
    const [allActivity, series, usage, now, cleared, running, agents, usd, reread, background] =
      await Promise.all([
        read($, activityAtom),
        read($, seriesAtom),
        read($, usageAtom),
        $.clock.now(),
        read($, clearedAtom),
        read($, runningAtom),
        read($, agentsAtom),
        read($, sessionUsdAtom),
        read($, rereadAtom),
        read($, backgroundAtom),
      ]);
    const activity = withoutCleared(allActivity, cleared.ids);
    const live = liveEntries({
      running,
      agents: Object.values(agents).filter(isRunning),
      activity,
      background,
      now,
    });
    if (live.length > 0) ticker ??= $.clock.every(TICK_MS, () => $.ui.invalidate("ui.render"));
    else stopTicking();
    return activityTab($.ui.resolve(e), {
      activity,
      series,
      usage,
      usd,
      rereads: reread.suppressed,
      live,
      now,
      width: e.props.bodyColumns,
      height: e.props.scroll.bodyRows - TAB_BAR_ROWS,
      clear: () => void clearActivity($),
      openCall: (id) => void openIfRecorded($, id),
    });
  });

  on("ui.close", { id: PANE }, (_$, e, next) => {
    stopTicking();
    return next(e);
  });
}

function stopTicking(): void {
  ticker?.cancel();
  ticker = undefined;
}

async function clearActivity($: EngineInterface): Promise<void> {
  const [activity, calls] = await Promise.all([read($, activityAtom), read($, callsAtom)]);
  await Promise.all([
    update($, clearedAtom, () => ({ ids: [...activity, ...calls].map((entry) => entry.id) })),
    update($, seriesAtom, clearedRing),
  ]);
}

async function openIfRecorded($: EngineInterface, callId: string): Promise<void> {
  const [calls, messages] = await Promise.all([read($, callsAtom), $.session.messages()]);
  if (recordOf(calls, messages, callId)) await update($, openCallAtom, () => callId);
}
