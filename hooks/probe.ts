import type { EngineInterface, Register } from "claude-code";

const LOG_EVERY_CALLS = 200;

type ComponentStats = { calls: number; totalMs: number; maxMs: number; requestIds: Set<string> };

export function registerProbe(on: Parameters<Register>[0]): void {
  const statsByComponent = new Map<string, ComponentStats>();
  let totalCalls = 0;

  on("ui.render", async ($, e, next) => {
    const startedAt = performance.now();
    const result = await next(e);
    record(statsByComponent, e.component, e.requestId, performance.now() - startedAt);
    totalCalls += 1;
    if (totalCalls % LOG_EVERY_CALLS === 0) logStats($, statsByComponent, totalCalls);
    return result;
  });
}

function record(
  statsByComponent: Map<string, ComponentStats>,
  component: string,
  requestId: string | undefined,
  ms: number,
): void {
  const stats = statsByComponent.get(component) ?? {
    calls: 0,
    totalMs: 0,
    maxMs: 0,
    requestIds: new Set<string>(),
  };
  stats.calls += 1;
  stats.totalMs += ms;
  stats.maxMs = Math.max(stats.maxMs, ms);
  if (requestId !== undefined) stats.requestIds.add(requestId);
  statsByComponent.set(component, stats);
}

function logStats(
  $: EngineInterface,
  statsByComponent: Map<string, ComponentStats>,
  totalCalls: number,
): void {
  const rows = [...statsByComponent].map(
    ([component, stats]) =>
      `${component} calls=${stats.calls} totalMs=${stats.totalMs.toFixed(1)} maxMs=${stats.maxMs.toFixed(1)} ids=${stats.requestIds.size}`,
  );
  $.ui.log(`vane probe @${totalCalls}: ${rows.join(" | ")}`, { to: "debug" });
}
