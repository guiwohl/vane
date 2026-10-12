import { atom, read, update } from "claude-code";
import type { EngineInterface, On } from "claude-code";

import { countsIn, withUse } from "./use-counts";
import type { UseCounts } from "./use-counts";

export const COMMAND_USES_KEY = "commandUses";

const launchFolderAtom = atom({ plugin: "vane", key: "launchFolder" } as const, "");
const commandUsesAtom = atom(
  { plugin: "vane", key: "commandUses" } as const,
  {} as Record<string, number>,
);

export function trackCommands(on: On): void {
  on("session.start", { isInteractive: true }, async ($, e, next) => {
    const known = await read($, launchFolderAtom);
    const folder = known === "" ? e.cwd : known;
    const counts = countsIn(await storedUses($), folder);
    await update($, commandUsesAtom, () => counts);
    return next(e);
  });

  on("command.run", async ($, e, next) => {
    const result = await next(e);
    if (e.origin.kind !== "plugin") await countRun($, e.command).catch(() => undefined);
    return result;
  });
}

async function countRun($: EngineInterface, command: string): Promise<void> {
  const folder = await read($, launchFolderAtom);
  if (folder === "") return;
  const all = withUse(await storedUses($), folder, command);
  await $.store.set(COMMAND_USES_KEY, all);
  await update($, commandUsesAtom, () => countsIn(all, folder));
}

async function storedUses($: EngineInterface): Promise<UseCounts> {
  return ((await $.store.get(COMMAND_USES_KEY)) ?? {}) as UseCounts;
}
