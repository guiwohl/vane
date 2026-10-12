import { describe, expect, test } from "claude-code/testing";

import { labelOf, reconciled } from "../hooks/background-model";
import type { BackgroundWork } from "../types";

const NOW = 50_000;

describe("background work reconciliation", () => {
  test("B1 a new in-flight task is kept with the current clock", () => {
    expect(
      reconciled([], [task("s1", "shell", "running", { command: "npm run dev" })], NOW),
    ).toEqual([{ id: "s1", type: "shell", label: "npm run dev", startedAt: NOW }]);
  });

  test("B2 a task already known keeps its original start", () => {
    const known: BackgroundWork[] = [work("s1", 1_000)];

    const next = reconciled(known, [task("s1", "shell", "running", { command: "x" })], NOW);

    expect(next.map((one) => one.startedAt)).toEqual([1_000]);
  });

  test("B3 a task no longer listed is dropped", () => {
    const known: BackgroundWork[] = [work("s1", 1_000), work("s2", 2_000)];

    const next = reconciled(known, [task("s2", "shell", "running", { command: "x" })], NOW);

    expect(next.map((one) => one.id)).toEqual(["s2"]);
  });

  test("B4 an empty list empties the set", () => {
    expect(reconciled([work("s1", 1_000)], [], NOW)).toEqual([]);
  });

  test("B5 a listed task that has ended is left out, whatever the case", () => {
    const tasks = [
      task("a", "shell", "completed", { command: "x" }),
      task("b", "shell", "Failed", { command: "x" }),
      task("c", "shell", "KILLED", { command: "x" }),
      task("d", "shell", "running", { command: "x" }),
    ];

    expect(reconciled([], tasks, NOW).map((one) => one.id)).toEqual(["d"]);
  });

  test("B6 a task with a status nobody documented is kept", () => {
    const tasks = [
      task("a", "shell", "in_progress", { command: "x" }),
      task("b", "shell", "active", { command: "x" }),
      task("c", "shell", "pending", { command: "x" }),
    ];

    expect(reconciled([], tasks, NOW).map((one) => one.id)).toEqual(["a", "b", "c"]);
  });
});

describe("background work label", () => {
  test("L1 a shell is its command", () => {
    expect(
      labelOf(task("s", "shell", "running", { command: "npm run dev", description: "d" })),
    ).toBe("npm run dev");
  });

  test("L2 a monitor is its server and tool", () => {
    expect(
      labelOf(task("m", "monitor", "running", { server: "gh", tool: "watch", description: "d" })),
    ).toBe("gh watch");
  });

  test("L3 a monitor with only a server is the server", () => {
    expect(labelOf(task("m", "monitor", "running", { server: "gh", description: "d" }))).toBe("gh");
  });

  test("L4 a workflow is its name", () => {
    expect(labelOf(task("w", "workflow", "running", { name: "release", description: "d" }))).toBe(
      "release",
    );
  });

  test("L5 a subagent is its agent type", () => {
    expect(
      labelOf(task("a", "subagent", "running", { agent_type: "Explore", description: "d" })),
    ).toBe("Explore");
  });

  test("L6 a task with none of those is its description", () => {
    expect(labelOf(task("x", "other", "running", { description: "do the thing" }))).toBe(
      "do the thing",
    );
  });

  test("L7 the label is the first line, printable", () => {
    const label = labelOf(task("s", "shell", "running", { command: "echo\ta\u0007b\nsecond" }));

    expect(label).toBe("echo ab");
  });
});

function task(
  id: string,
  type: string,
  status: string,
  more: Record<string, string> = {},
): Parameters<typeof labelOf>[0] {
  return { id, type, status, description: "", ...more };
}

function work(id: string, startedAt: number): BackgroundWork {
  return { id, type: "shell", label: id, startedAt };
}
