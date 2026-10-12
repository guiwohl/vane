import { atom, update } from "claude-code";
import type { On } from "claude-code";

import {
  afterCompaction,
  emptySpend,
  freshSpend,
  restoredSpend,
  SPEND_SESSIONS_KEY,
  withSession,
} from "./spend-model";

const spendAtom = atom({ plugin: "vane", key: "spend" } as const, emptySpend());

export function trackSpend(on: On): void {
  on("session.start", { isInteractive: true }, async ($, e, next) => {
    const restored = restoredSpend(await $.store.get(SPEND_SESSIONS_KEY), await $.session.id());
    if (restored !== undefined) await update($, spendAtom, () => restored);
    return next(e);
  });

  on("classic.SessionStart", { source: ["startup", "clear", "compact"] }, async ($, e, next) => {
    if (e.agent_id !== undefined) return next(e);
    const state = await update($, spendAtom, (current) =>
      e.source === "compact" ? afterCompaction(current) : freshSpend(),
    );
    await $.store.set(
      SPEND_SESSIONS_KEY,
      withSession(await $.store.get(SPEND_SESSIONS_KEY), await $.session.id(), state),
    );
    return next(e);
  });
}
