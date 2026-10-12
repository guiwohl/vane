import { atom, update } from "claude-code";
import type { On } from "claude-code";

import type { RereadState } from "../types";

const MAX_ENTRIES = 256;
const HEX_RADIX = 16;
const BYTE_HEX_DIGITS = 2;

const rereadAtom = atom(
  { plugin: "vane", key: "reread" } as const,
  { seen: [], suppressed: 0 } as RereadState,
);

type TextRead = {
  type: "text";
  file: { filePath: string; content: string; numLines: number; startLine: number };
};

type ReadRange = { file_path?: string; offset?: number; limit?: number };

export function rememberRead(
  state: RereadState,
  key: string,
  hash: string,
  cap: number,
): RereadState {
  const prior = state.seen.find((entry) => entry.key === key);
  const isSuppressed = prior?.hash === hash && !prior.told;
  return {
    seen: [
      ...state.seen.filter((entry) => entry.key !== key),
      { key, hash, told: isSuppressed },
    ].slice(-cap),
    suppressed: state.suppressed + (isSuppressed ? 1 : 0),
  };
}

export function guardRereads(on: On): void {
  on("classic.PostToolUse", { tool_name: "Read" }, async ($, e, next) => {
    const result = await next(e);
    const delivered = e.tool_response as Partial<TextRead> | undefined;
    if (delivered?.type !== "text" || typeof delivered.file?.content !== "string") return result;

    const range = e.tool_input as ReadRange;
    const key = JSON.stringify([
      e.agent_id ?? "main",
      range.file_path ?? delivered.file.filePath,
      range.offset ?? null,
      range.limit ?? null,
    ]);
    const hash = await sha256(JSON.stringify(delivered));

    const recorded = await update($, rereadAtom, (state) =>
      rememberRead(state, key, hash, MAX_ENTRIES),
    );
    if (recorded.seen.at(-1)?.told !== true) return result;

    const content = unchangedNotice(delivered.file.filePath, range);
    return {
      ...result,
      updatedToolOutput: {
        ...delivered,
        file: { ...delivered.file, content, numLines: 1, startLine: 1 },
      },
    };
  });

  on("classic.PreCompact", async ($, e, next) => {
    await update($, rereadAtom, (state) => ({ ...state, seen: [] }));
    return next(e);
  });

  on("classic.SessionStart", { source: "clear" }, async ($, e, next) => {
    await update($, rereadAtom, () => ({ seen: [], suppressed: 0 }));
    return next(e);
  });
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(HEX_RADIX).padStart(BYTE_HEX_DIGITS, "0"),
  ).join("");
}

function unchangedNotice(filePath: string, { offset, limit }: ReadRange): string {
  const span =
    offset === undefined && limit === undefined
      ? ""
      : ` (offset ${offset ?? 0}, limit ${limit ?? "none"})`;
  return `${filePath}${span} is byte-for-byte identical to the copy already delivered earlier in this conversation. Use that copy. The file is not empty or missing. To get the content again, issue the same Read call once more and it will be returned in full.`;
}
