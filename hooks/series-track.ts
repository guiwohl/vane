import { atom, update } from "claude-code";
import type { On } from "claude-code";

import { emptyRing, recordSample } from "./series-ring";

const seriesAtom = atom({ plugin: "vane", key: "series" } as const, emptyRing());

export function trackSeries(on: On): void {
  on("session.measure", { changed: ["context", "cost"] }, async ($, e, next) => {
    const [at, usage] = await Promise.all([$.clock.now(), $.session.usage()]);
    await update($, seriesAtom, (ring) =>
      recordSample(ring, {
        at,
        startedAt: usage.startedAt,
        tokens: e.context.tokens,
        cost: e.cost?.usd,
      }),
    );
    return next(e);
  });
}
