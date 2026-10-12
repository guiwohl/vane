import { atom, read, update } from "claude-code";
import type { EngineInterface, On } from "claude-code";

import { countsIn, withUse } from "./use-counts";
import type { UseCounts } from "./use-counts";

export const SKILL_USES_KEY = "skillUses";

const launchFolderAtom = atom({ plugin: "vane", key: "launchFolder" } as const, "");
const skillUsesAtom = atom(
  { plugin: "vane", key: "skillUses" } as const,
  {} as Record<string, number>,
);

export function trackSkills(on: On): void {
  on("session.start", { isInteractive: true }, async ($, e, next) => {
    const known = await read($, launchFolderAtom);
    const folder = known === "" ? e.cwd : known;
    const counts = countsIn(await storedUses($), folder);
    await update($, launchFolderAtom, () => folder);
    await update($, skillUsesAtom, () => counts);
    return next(e);
  });

  on("skill.prompt", async ($, e, next) => {
    const prompt = await next(e);
    const folder = await read($, launchFolderAtom);
    if (folder === "") return prompt;
    const all = withUse(await storedUses($), folder, e.skill);
    await $.store.set(SKILL_USES_KEY, all);
    await update($, skillUsesAtom, () => countsIn(all, folder));
    return prompt;
  });
}

async function storedUses($: EngineInterface): Promise<UseCounts> {
  return ((await $.store.get(SKILL_USES_KEY)) ?? {}) as UseCounts;
}
