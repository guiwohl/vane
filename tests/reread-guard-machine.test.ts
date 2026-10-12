import { describe, expect, test } from "claude-code/testing";
import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";

import { rememberRead } from "../hooks/reread-guard";
import type { RereadState } from "../types";

type Delivery = {
  path?: string;
  content?: string;
  offset?: number;
  limit?: number;
  agentId?: string;
  response?: unknown;
};

const FILE = "/repo/src/a.ts";
const BODY = "line one\nline two\n";

describe("the reread guard as a state machine", () => {
  test("RG1 identical content at the same path and range is suppressed the second time", async ($, on) => {
    world(on);

    const first = await deliver($, {});
    const second = await deliver($, {});

    expect(first).toBeUndefined();
    expect(contentOf(second)).toContain("byte-for-byte identical");
    expect(contentOf(second)).toContain(FILE);
  });

  test("RG2 content that differs by one byte is not suppressed", async ($, on) => {
    world(on);

    await deliver($, { content: BODY });
    const changed = await deliver($, { content: "line one\nline twp\n" });

    expect(changed).toBeUndefined();
  });

  test("RG3 two ranges of one file never suppress each other", async ($, on) => {
    world(on);

    await deliver($, { offset: 0, limit: 10 });
    const otherRange = await deliver($, { offset: 10, limit: 10 });
    const sameRange = await deliver($, { offset: 0, limit: 10 });

    expect(otherRange).toBeUndefined();
    expect(contentOf(sameRange)).toContain("offset 0, limit 10");
  });

  test("RG4 a whole-file read and a ranged read of the same content are different keys", async ($, on) => {
    world(on);

    await deliver($, {});
    const ranged = await deliver($, { offset: 0, limit: 10 });

    expect(ranged).toBeUndefined();
  });

  test("RG5 after a suppressed read the identical read passes with real content, then the next is suppressed again", async ($, on) => {
    world(on);

    await deliver($, {});
    const suppressed = await deliver($, {});
    const passedThrough = await deliver($, {});
    const suppressedAgain = await deliver($, {});

    expect(contentOf(suppressed)).toContain("byte-for-byte identical");
    expect(passedThrough).toBeUndefined();
    expect(contentOf(suppressedAgain)).toContain("byte-for-byte identical");
  });

  test("RG6 two agents reading the same file never suppress each other", async ($, on) => {
    world(on);

    await deliver($, { agentId: "agent-1" });
    const otherAgent = await deliver($, { agentId: "agent-2" });
    const main = await deliver($, {});
    const sameAgent = await deliver($, { agentId: "agent-1" });

    expect(otherAgent).toBeUndefined();
    expect(main).toBeUndefined();
    expect(contentOf(sameAgent)).toContain("byte-for-byte identical");
  });

  test("RG7 at the cap the least recently read entry is evicted and the touched one survives", () => {
    const cap = 3;
    const filled = ["a", "b", "c"].reduce(
      (state, key) => rememberRead(state, key, `h-${key}`, cap),
      EMPTY,
    );
    const touched = rememberRead(filled, "a", "h-a2", cap);
    const overflowed = rememberRead(touched, "d", "h-d", cap);

    expect(keysOf(overflowed)).toEqual(["c", "a", "d"]);
    expect(keysOf(overflowed)).not.toContain("b");
  });

  test("RG8 exactly the cap of entries are all remembered", () => {
    const cap = 3;
    const filled = ["a", "b", "c"].reduce(
      (state, key) => rememberRead(state, key, `h-${key}`, cap),
      EMPTY,
    );

    expect(keysOf(filled)).toEqual(["a", "b", "c"]);
    expect(rememberRead(filled, "a", "h-a", cap).seen.at(-1)?.told).toBe(true);
  });

  test("RG9 an errored result is never suppressed, however often it repeats", async ($, on) => {
    world(on);
    const errored = {
      type: "error",
      file: { filePath: FILE, content: "File does not exist.", numLines: 1, startLine: 1 },
    };

    const results = [
      await deliver($, { response: errored }),
      await deliver($, { response: errored }),
      await deliver($, { response: errored }),
      await deliver($, { response: "Error: File does not exist." }),
      await deliver($, { response: "Error: File does not exist." }),
    ];

    expect(results).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  test("RG10 an error between two identical reads does not erase what was delivered before", async ($, on) => {
    world(on);

    await deliver($, {});
    await deliver($, { response: { type: "error", error: "boom" } });
    const again = await deliver($, {});

    expect(contentOf(again)).toContain("byte-for-byte identical");
  });

  test("RG11 clearing the conversation forgets everything", async ($, on) => {
    world(on);
    await deliver($, {});

    await $.classic.SessionStart({ source: "clear" });
    const afterClear = await deliver($, {});

    expect(afterClear).toBeUndefined();
  });

  test("RG12 compaction forgets everything", async ($, on) => {
    world(on);
    await deliver($, {});

    await $.classic.PreCompact({ trigger: "auto", custom_instructions: null });
    const afterCompact = await deliver($, {});

    expect(afterCompact).toBeUndefined();
  });

  test("RG13 the notice replaces only the content and keeps the rest of the delivered file", async ($, on) => {
    world(on);

    await deliver($, {});
    const suppressed = await deliver($, {});

    expect(suppressed).toMatchObject({
      type: "text",
      file: { filePath: FILE, numLines: 1, startLine: 1 },
    });
  });
});

function world(on: On): void {
  const state = new Map<string, { value: unknown; version: number }>();
  const keyOf = (address: { plugin: string; key: string; id?: string }): string =>
    `${address.plugin}.${address.key}.${address.id ?? ""}`;
  on("state.get", (_$, e) => {
    const entry = state.get(keyOf(e));
    return { value: { value: entry?.value, version: entry?.version ?? 0 } };
  });
  on("state.set", (_$, e) => {
    const version = (state.get(keyOf(e))?.version ?? 0) + 1;
    state.set(keyOf(e), { value: JSON.parse(JSON.stringify(e.value)), version });
    return { value: { isSet: true, version } };
  });
  on("classic.PostToolUse", () => ({}));
  on("classic.PreCompact", () => ({}));
  on("classic.SessionStart", () => ({}));
  on("session.model", () => ({ value: "opus" }));
  on("session.cwd", () => ({ value: "/repo" }));
  on("session.usage", () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }));
  on("store.get", () => ({ value: undefined }));
  on("store.set", () => ({ value: undefined }));
  on("store.keys", () => ({ value: [] }));
  on("session.id", () => ({ value: "s1" }));
  on("agent.list", () => ({ value: [] }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
}

async function deliver($: Engine, delivery: Delivery): Promise<unknown> {
  const path = delivery.path ?? FILE;
  const content = delivery.content ?? BODY;
  const input: Record<string, unknown> = { file_path: path };
  if (delivery.offset !== undefined) input.offset = delivery.offset;
  if (delivery.limit !== undefined) input.limit = delivery.limit;
  const event = {
    tool_name: "Read",
    tool_use_id: "toolu_1",
    tool_input: input,
    tool_response: delivery.response ?? {
      type: "text",
      file: { filePath: path, content, numLines: content.split("\n").length, startLine: 1 },
    },
    ...(delivery.agentId === undefined ? {} : { agent_id: delivery.agentId }),
  };
  const result = await $.classic.PostToolUse(event);
  return result.updatedToolOutput;
}

function contentOf(output: unknown): string {
  return (output as { file?: { content?: string } } | undefined)?.file?.content ?? "";
}

const EMPTY: RereadState = { seen: [], suppressed: 0 };

function keysOf(state: RereadState): string[] {
  return state.seen.map((entry) => entry.key);
}
