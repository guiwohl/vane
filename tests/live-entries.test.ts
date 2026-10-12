import { describe, expect, test } from "claude-code/testing";

import { FAILURE_WINDOW_MS, liveEntries } from "../hooks/live-draw";
import type { LiveSources } from "../hooks/live-draw";
import type { Activity, BackgroundWork } from "../types";

const NOW = 1_000_000;

describe("what the Now block lists", () => {
  test("E1 a failure inside the window is listed, one past it is not", () => {
    const entries = liveEntries(
      sources({
        activity: [
          failure("old", NOW - FAILURE_WINDOW_MS - 1),
          failure("edge", NOW - FAILURE_WINDOW_MS),
        ],
      }),
    );

    expect(entries.map((entry) => entry.key)).toEqual(["edge"]);
  });

  test("E2 failures are capped at three, newest first", () => {
    const entries = liveEntries(
      sources({ activity: [1, 2, 3, 4].map((n) => failure(`f${n}`, NOW - 10_000 + n)) }),
    );

    expect(entries.map((entry) => entry.key)).toEqual(["f4", "f3", "f2"]);
  });

  test("E3 an old failure does not take the place of a recent one", () => {
    const entries = liveEntries(
      sources({
        activity: [failure("recent", NOW - 1_000), failure("old", NOW - FAILURE_WINDOW_MS - 5_000)],
      }),
    );

    expect(entries.map((entry) => entry.key)).toEqual(["recent"]);
  });

  test("E4 background work is listed between running tools and agents, subagents never", () => {
    const entries = liveEntries(
      sources({
        running: [{ callId: "t1", tool: "Read", target: "a", startedAt: NOW }],
        background: [
          { id: "s1", type: "shell", label: "npm run dev", startedAt: NOW },
          { id: "sub", type: "subagent", label: "Explore", startedAt: NOW },
        ],
        agents: [
          {
            id: "ag",
            type: "x",
            description: "scan",
            background: true,
            model: "m",
            status: "running",
            startedAt: NOW,
            ctxTokens: 0,
            tokensIn: 0,
            tokensOut: 0,
            running: [],
          },
        ],
      }),
    );

    expect(entries.map((entry) => `${entry.kind}:${entry.key}`)).toEqual([
      "tool:t1",
      "background:s1",
      "agent:ag",
    ]);
  });

  test("E5 background work is capped, newest kept", () => {
    const background = [1, 2, 3, 4].map((n): BackgroundWork => ({
      id: `s${n}`,
      type: "shell",
      label: `c${n}`,
      startedAt: NOW,
    }));

    const entries = liveEntries(sources({ background }));

    expect(entries.map((entry) => entry.key)).toEqual(["s3", "s4"]);
  });
});

describe("how background work reads", () => {
  test("E6 a background row is tagged bg and names its type before its label", () => {
    const [entry] = liveEntries(
      sources({
        background: [{ id: "m", type: "monitor", label: "github watch", startedAt: NOW }],
      }),
    );

    expect(entry).toMatchObject({ tool: "bg", target: "monitor: github watch" });
  });
});

function sources(more: Partial<LiveSources>): LiveSources {
  return { running: [], agents: [], activity: [], background: [], now: NOW, ...more };
}

function failure(id: string, endedAt: number): Activity {
  return { id, tool: "Bash", target: id, ms: 1, endedAt, isErrored: true, added: 0, removed: 0 };
}
