import { describe, expect, mock, test } from "claude-code/testing";
import type { On, ToolCallResult } from "claude-code";
import type { Engine } from "claude-code/testing";

const BRIEF = "KIND: research\n\nGOAL\nfind it\n\nSCOPE\nread only";
const GOOD_NAME = "parser-fix-review";
const NAME_RULE = "lowercase kebab-case name of two to four words";
const GENERIC_WORDS = [
  "agent",
  "subagent",
  "sub",
  "helper",
  "worker",
  "task",
  "job",
  "thing",
  "stuff",
  "bot",
];
const MISSHAPEN_NAMES = [
  "scout",
  "Parser-Fix",
  "parser_fix",
  "a-b-c-d-e",
  "parser--fix",
  "parser-fix-",
  " parser-fix ",
  "parser-fix\n",
];
const NUMBERED_NAMES = ["parser-fix-2", "worker-1-review", "7-parser"];
const LEGITIMATE_NAMES = [
  "parser-fix",
  "parser-fix-review",
  "a-b-c-d",
  "backlog-task-sync",
  "git-run-tracker",
  "job-queue-retry",
  "http2-header-parse",
];

describe("the spawn name gate", () => {
  test("N1 a spawn with no name is refused and told to give one", async ($, on) => {
    constitutionOn(on);

    const result = await spawn($, undefined);

    expect(result.deny).toContain("Give the agent a name");
    expect(result.deny).toContain(NAME_RULE);
  });

  test("N2 a blank name is refused like a missing one", async ($, on) => {
    constitutionOn(on);

    const result = await spawn($, "   ");

    expect(result.deny).toContain("Give the agent a name");
  });

  for (const name of MISSHAPEN_NAMES) {
    test(`N3 the name ${JSON.stringify(name)} is refused as not the required shape`, async ($, on) => {
      constitutionOn(on);

      const result = await spawn($, name);

      expect(result.deny).toContain(`is not a ${NAME_RULE}`);
    });
  }

  for (const word of GENERIC_WORDS) {
    test(`N4 a name ending in the generic word ${word} is refused and the word is named`, async ($, on) => {
      constitutionOn(on);

      const result = await spawn($, `parser-${word}`);

      expect(result.deny).toContain(`"${word}"`);
      expect(result.deny).toContain(NAME_RULE);
    });
  }

  test("N5 a good name passes on to the brief check", async ($, on) => {
    constitutionOn(on);

    const passed = await spawn($, GOOD_NAME);
    const refusedBrief = await spawn($, GOOD_NAME, "no kind line");

    expect(passed.deny).toBeUndefined();
    expect(refusedBrief.deny).toContain("KIND:");
  });

  test("N6 with the constitution off a nameless spawn passes", async ($, on) => {
    worldOf(on, {});

    const result = await spawn($, undefined);

    expect(result.deny).toBeUndefined();
  });

  for (const name of LEGITIMATE_NAMES) {
    test(`N7 the name ${name} is not refused, whatever its first or middle words`, async ($, on) => {
      constitutionOn(on);

      const result = await spawn($, name);

      expect(result.deny).toBeUndefined();
    });
  }

  for (const name of NUMBERED_NAMES) {
    test(`N8 the name ${name} is refused for holding a number as a word`, async ($, on) => {
      constitutionOn(on);

      const result = await spawn($, name);

      expect(result.deny).toBeDefined();
      expect(result.deny).toContain("number");
    });
  }
});

function worldOf(on: On, variables: Record<string, string>): void {
  mock.env(on, variables);
  on("tool.call", () => ({ result: "ok", text: "ok", ref: 1 }));
}

function constitutionOn(on: On): void {
  worldOf(on, { CLAUDE_CONSTITUTION: "1" });
}

async function spawn(
  $: Engine,
  name: string | undefined,
  prompt: string = BRIEF,
): Promise<{ deny?: string }> {
  const call = $.tool.call as (e: object) => Promise<ToolCallResult>;
  const result = await call({
    tool: "Agent",
    description: "d",
    prompt,
    ...(name === undefined ? {} : { name }),
  });
  return result.isError === true ? { deny: result.text } : {};
}
