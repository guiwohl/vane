import { atom, read, update } from "claude-code";
import type { EngineInterface, On, SessionMeasureInput } from "claude-code";

import type { UsageSnap } from "../types";
import { compactThreshold, forgetThreshold } from "./breakdown";

const usageAtom = atom(
  { plugin: "vane", key: "usage" } as const,
  { context: null, limits: [], tokens: null, window: null } as UsageSnap,
);

type Measure = Pick<SessionMeasureInput, "context" | "rateLimits" | "changed">;

export function trackUsage(on: On): void {
  on("session.start", async ($, e, next) => {
    await refreshUsage($);
    return next(e);
  });

  on("classic.SessionStart", { source: ["clear", "resume", "fork"] }, async ($, e, next) => {
    forgetThreshold();
    await refreshUsage($);
    return next(e);
  });

  on("session.measure", { changed: ["context", "rateLimits"] }, async ($, e, next) => {
    await storeUsage($, e);
    return next(e);
  });
}

async function contextPercentOf(
  $: EngineInterface,
  context: Measure["context"],
): Promise<number | null> {
  if (context.tokens === undefined) return context.percent ?? null;
  const threshold = await compactThreshold((args) => $.session.usage(args));
  if (!threshold) return context.percent ?? null;
  return Math.min(100, Math.round((context.tokens / threshold) * 100));
}

async function storeUsage($: EngineInterface, measure: Measure): Promise<void> {
  const stored = await read($, usageAtom);
  const snap: UsageSnap = {
    context: measure.changed.includes("context")
      ? await contextPercentOf($, measure.context)
      : stored.context,
    limits: measure.rateLimits.map((limit) => ({
      label: limitLabel(limit.kind),
      percent: limit.percentUsed,
      ...(limit.resetsAt === undefined ? {} : { resetsAt: limit.resetsAt }),
    })),
    tokens: measure.changed.includes("context") ? (measure.context.tokens ?? null) : stored.tokens,
    window: measure.changed.includes("context") ? measure.context.window : stored.window,
  };
  if (JSON.stringify(stored) === JSON.stringify(snap)) return;
  await update($, usageAtom, () => snap);
}

async function refreshUsage($: EngineInterface): Promise<void> {
  await storeUsage($, { ...(await $.session.usage()), changed: ["context", "rateLimits"] });
}

function limitLabel(kind: string): string {
  const name = kind.toLowerCase();
  if (name.includes("five") || name.includes("5h") || name.includes("5_h")) return "5h";
  if (name.includes("seven") || name.includes("7d") || name.includes("week")) return "7d";
  return name.replace(/_/g, " ");
}
