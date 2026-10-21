import type { EngineInterface, On } from "claude-code";

const REQUIRED_BRIEF_FIELDS = {
  research: ["GOAL", "SCOPE"],
  review: ["GOAL", "SCOPE"],
  implementation: ["GOAL", "DESIGN", "DOCTRINE", "SCOPE", "METHOD", "ACCEPTANCE", "REPORT"],
};

type SpawnKind = keyof typeof REQUIRED_BRIEF_FIELDS;

const SPAWN_KINDS = Object.keys(REQUIRED_BRIEF_FIELDS);

function isSpawnKind(kind: string | undefined): kind is SpawnKind {
  return kind !== undefined && kind in REQUIRED_BRIEF_FIELDS;
}

const FILE_WRITING_TOOLS = ["Write", "Edit", "NotebookEdit"];

function spawnKindOf(prompt: string): string | undefined {
  return /^\s*KIND:\s*(\w+)/m.exec(prompt)?.[1]?.toLowerCase();
}

function missingFieldsOf(kind: SpawnKind, prompt: string): string[] {
  return REQUIRED_BRIEF_FIELDS[kind].filter(
    (field) => !new RegExp(`^\\s*${field}\\b`, "m").test(prompt),
  );
}

async function isConstitutionEnabled($: EngineInterface): Promise<boolean> {
  return (await $.env.get("CLAUDE_CONSTITUTION")) === "1";
}

export function registerDoctrine(on: On): void {
  let filesWritten = false;
  let leadRanCommandSinceWrite = false;

  const recordToolUse = (toolName: string, agentId: string | undefined): void => {
    if (FILE_WRITING_TOOLS.includes(toolName)) {
      filesWritten = true;
      leadRanCommandSinceWrite = false;
    } else if (toolName === "Bash" && agentId === undefined) {
      leadRanCommandSinceWrite = true;
    }
  };

  on("classic.PreToolUse", { tool: "Agent" }, async ($, e, next) => {
    if (!(await isConstitutionEnabled($))) return next(e);
    const kind = spawnKindOf(e.prompt);
    if (!isSpawnKind(kind))
      return { deny: `Start the prompt with a line "KIND: ${SPAWN_KINDS.join(" | ")}".` };
    const missing = missingFieldsOf(kind, e.prompt);
    if (missing.length === 0) return next(e);
    return { deny: `The ${kind} prompt is missing: ${missing.join(", ")}.` };
  });

  on("classic.PostToolUse", { hook_event_name: "PostToolUse" }, async ($, e, next) => {
    if (await isConstitutionEnabled($)) recordToolUse(e.tool_name, e.agent_id);
    return next(e);
  });

  on(
    "classic.PostToolUseFailure",
    { hook_event_name: "PostToolUseFailure" },
    async ($, e, next) => {
      if (await isConstitutionEnabled($)) recordToolUse(e.tool_name, e.agent_id);
      return next(e);
    },
  );

  on("classic.Stop", { hook_event_name: "Stop" }, async ($, e, next) => {
    if (!(await isConstitutionEnabled($))) return next(e);
    if (!e.stop_hook_active && filesWritten && !leadRanCommandSinceWrite)
      return {
        ...(await next(e)),
        block:
          "Files were written and you have run no command since. Run the check yourself, read the output, then report the real status.",
      };
    return next(e);
  });

  on(
    "classic.SessionStart",
    { source: ["startup", "resume", "clear", "fork"] },
    async (_$, e, next) => {
      filesWritten = false;
      leadRanCommandSinceWrite = false;
      return next(e);
    },
  );
}
