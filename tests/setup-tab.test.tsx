import { describe, expect, test } from "claude-code/testing";

import {
  HOME,
  SIZES,
  WORK,
  buttonKeys,
  buttonLabels,
  mountPane,
  openTab,
  paneOnTab,
  pressButton,
  rowWith,
  runTool,
  screenOf,
  settle,
  worldOf,
} from "./pane-world";
import type { WorldSpec } from "./pane-world";

const SESSION_START = { cwd: WORK, surface: "terminal", isInteractive: true } as const;
const SKILL_FILE = "---\ndescription: does a thing\n---\n";
const SECTION_LABELS = ["▸ Skills", "▸ Commands", "▸ MCPs"];

const SPEC: WorldSpec = {
  skills: [
    { name: "built", source: "built-in", tokens: 1 },
    { name: "globe", source: "userSettings", tokens: 1 },
    { name: "proj", source: "projectSettings", tokens: 1 },
  ],
  files: {
    [`${WORK}/.claude/skills/proj/SKILL.md`]: SKILL_FILE,
    [`${HOME}/.claude/skills/globe/SKILL.md`]: SKILL_FILE,
  },
  mcpTools: [{ name: "mcp__linear__create", serverName: "linear", tokens: 1, isLoaded: true }],
};

describe("setup tab", () => {
  for (const [sizeName, size] of SIZES) {
    test(`U1 the Setup tab draws its three closed sections in a ${sizeName} pane`, async ($, on) => {
      worldOf(on, SPEC);
      const first = await mountPane($);
      await openTab(first, "Setup");
      await first.unmount();
      const pane = await mountPane($, size);

      const labels = await buttonLabels(pane);
      const rows = await screenOf(pane, size);

      expect(SECTION_LABELS.filter((label) => !labels.includes(label))).toEqual([]);
      expect(rowWith(rows, "Skills")).toBeDefined();
      expect(rows.filter((row) => row.length > size.columns)).toEqual([]);
    });
  }

  test("U2 pressing the Skills row opens it and lists project skills before global before built-in, each with its suffix", async ($, on) => {
    worldOf(on, SPEC);
    const pane = await paneOnTab($, "Setup");
    expect(await buttonKeys(pane)).not.toContain("proj");

    await pressButton(pane, "skills-toggle");

    const keys = await buttonKeys(pane);
    const rows = await screenOf(pane);
    expect(await buttonLabels(pane)).toContain("▾ Skills");
    expect(keys.indexOf("proj")).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf("proj")).toBeLessThan(keys.indexOf("globe"));
    expect(keys.indexOf("globe")).toBeLessThan(keys.indexOf("built"));
    expect(rowWith(rows, "proj")).toContain("(Project)");
    expect(rowWith(rows, "globe")).toContain("(Global)");
    expect(rowWith(rows, "built")).toContain("(Built-in)");
  });

  test("U3 pressing an open section row closes it again", async ($, on) => {
    worldOf(on, SPEC);
    const pane = await paneOnTab($, "Setup");
    await pressButton(pane, "skills-toggle");

    await pressButton(pane, "skills-toggle");

    expect(await buttonKeys(pane)).not.toContain("proj");
    expect(await buttonLabels(pane)).toContain("▸ Skills");
  });

  test("U4 leaving Setup and coming back finds every section closed", async ($, on) => {
    worldOf(on, SPEC);
    const pane = await paneOnTab($, "Setup");
    await pressButton(pane, "skills-toggle");
    await openTab(pane, "Agents");

    await openTab(pane, "Setup");

    expect(await buttonLabels(pane)).toEqual(expect.arrayContaining(SECTION_LABELS));
    expect(await buttonKeys(pane)).not.toContain("proj");
  });

  test("U5 pressing a server action runs the mcp command for that server", async ($, on) => {
    const world = worldOf(on, SPEC);
    const pane = await paneOnTab($, "Setup");
    await pressButton(pane, "mcps-toggle");
    await pressButton(pane, "linear");

    await pressButton(pane, "linear-disable");

    expect(world.mcpCommands).toEqual(["disable linear"]);
  });

  test("U6 a rejected mcp command shows a toast naming it", async ($, on) => {
    const world = worldOf(on, { ...SPEC, failMcpCommands: true });
    const pane = await paneOnTab($, "Setup");
    await pressButton(pane, "mcps-toggle");
    await pressButton(pane, "linear");

    await pressButton(pane, "linear-disable");

    expect(world.toasts).toHaveLength(1);
    expect(world.toasts[0]).toContain("/mcp disable linear failed");
  });

  test("U7 a server name with whitespace is never sent as extra arguments", async ($, on) => {
    const world = worldOf(on, {
      ...SPEC,
      mcpTools: [{ name: "mcp__my_server__a", serverName: "my server", tokens: 1, isLoaded: true }],
    });
    const pane = await paneOnTab($, "Setup");
    await pressButton(pane, "mcps-toggle");
    await pressButton(pane, "my server");

    await pressButton(pane, "my server-disable");

    expect(world.mcpCommands).toEqual([]);
    expect(world.toasts).toHaveLength(1);
    expect(world.toasts[0]).toContain("my server");
  });

  test("U8 a skill used twice shows its count before its name and ranks above an unused skill of the same owner", async ($, on) => {
    worldOf(on, {
      ...SPEC,
      skills: [
        { name: "aaa", source: "userSettings", tokens: 1 },
        { name: "zzz", source: "userSettings", tokens: 1 },
      ],
    });
    await $.session.start(SESSION_START);
    for (let use = 0; use < 2; use++) await $.skill.prompt({ skill: "zzz", text: "Run zzz." });
    const pane = await paneOnTab($, "Setup");

    await pressButton(pane, "skills-toggle");

    const rows = await screenOf(pane);
    expect(rowWith(rows, "zzz")).toMatch(/^\s*2\s.*zzz/);
    expect(rows.findIndex((row) => row.includes("zzz"))).toBeLessThan(
      rows.findIndex((row) => row.includes("aaa")),
    );
  });

  test("U9 a call to an mcp tool counts on its server row and the clear button wipes the counts for good", async ($, on) => {
    const world = worldOf(on, SPEC);
    await $.session.start(SESSION_START);
    for (let call = 0; call < 3; call++)
      await runTool($, world, { tool: "mcp__linear__create", title: "x" });
    const pane = await paneOnTab($, "Setup");
    await pressButton(pane, "mcps-toggle");
    expect(rowWith(await screenOf(pane), "linear")).toMatch(/^\s*3\s.*linear/);

    await pressButton(pane, "clear-uses");

    expect(rowWith(await screenOf(pane), "linear")).not.toMatch(/^\s*3\s/);
    expect(await buttonKeys(pane)).not.toContain("clear-uses");
    await $.session.start(SESSION_START);
    await settle(pane);
    expect(rowWith(await screenOf(pane), "linear")).not.toMatch(/^\s*3\s/);
  });

  test("U10 pressing a skill name puts its slash command in front of the typed draft, once", async ($, on) => {
    const world = worldOf(on, SPEC);
    world.draft.text = "fix the bug";
    const pane = await paneOnTab($, "Setup");
    await pressButton(pane, "skills-toggle");

    await pressButton(pane, "proj");
    await pressButton(pane, "proj");

    expect(world.draft.text).toBe("/proj fix the bug");
  });
});
