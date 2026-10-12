export type Activity = {
  id: string;
  tool: string;
  target: string;
  ms: number;
  endedAt?: number;
  isErrored: boolean;
  added: number;
  removed: number;
};

export type AgentEdit = Activity & { agentId: string };

export type CallRecord = Activity & { agentId?: string; input: string; output: string };

export type RunningCall = { callId: string; tool: string; target: string };

export type StartedCall = RunningCall & { startedAt: number };

export type BackgroundWork = { id: string; type: string; label: string; startedAt: number };

export type TurnStats = { reads: number; commands: number; changedFiles: number };

export type UsageSnap = {
  context: number | null;
  limits: { label: string; percent: number; resetsAt?: string }[];
  tokens: number | null;
  window: number | null;
};

export type SeriesRing = {
  startedAt: number;
  origin: number | null;
  intervalMs: number;
  tokens: number[];
  cost: number[];
  turns: number[];
};

export type PromptInfo = { model: string; effort: string | null; cwd: string };

export type AgentStatus = "running" | "waiting" | "idle" | "done" | "failed" | "stopped" | "killed";

export type AgentNode = {
  id: string;
  parentId?: string;
  type: string;
  description: string;
  name?: string;
  background: boolean;
  model: string;
  effort?: string;
  status: AgentStatus;
  startedAt: number;
  endedAt?: number;
  ctxTokens: number;
  tokensIn: number;
  tokensOut: number;
  running: RunningCall[];
  branch?: string;
  worktree?: string;
};

export type AgentTree = Record<string, AgentNode>;

export type SpendOwner = { weight: number; pricedTokens: number; unpricedTokens: number };

export type SpendMiss = { at: number; cause: string; rebuilt: number; usd: number | null };

export type SpendRent = { tool: string; target: string; tokens: number };

export type SpendMemory = { model: string; endedAt: number; size: number | undefined };

export type SpendState = {
  owners: Record<string, SpendOwner>;
  mainModel: string;
  cacheReadTokens: number;
  promptTokens: number;
  missCount: number;
  lostUsd: number;
  misses: SpendMiss[];
  rentTokens: number;
  rent: SpendRent[];
  isCompacted: boolean;
  mainCacheTtl: "5m" | "1h" | null;
  baselineUsd: number | null;
  mainMemory: SpendMemory | null;
  agentMemories: Record<string, SpendMemory>;
};

export type RereadState = {
  seen: { key: string; hash: string; told: boolean }[];
  suppressed: number;
};

declare module "claude-code" {
  interface PluginState {
    vane: {
      activity: Activity[];
      agentEdits: AgentEdit[];
      calls: CallRecord[];
      openCall: string | null;
      running: StartedCall[];
      background: BackgroundWork[];
      toolMs: StateFamily<number>;
      turnStats: StateFamily<TurnStats | null>;
      series: SeriesRing;
      activityCleared: { ids: string[] };
      reread: {
        seen: { key: string; hash: string; told: boolean }[];
        suppressed: number;
      };
      usage: UsageSnap;
      tab: string;
      mcpSeen: string[];
      mcpQueued: string[];
      mcpOpen: string[];
      launchFolder: string;
      skillUses: Record<string, number>;
      commandUses: Record<string, number>;
      toolUses: Record<string, number>;
      skillsExpanded: string[];
      agents: Record<string, AgentNode>;
      openAgent: string | null;
      sessionUsd: number | null;
      spend: SpendState;
      promptInfo: PromptInfo;
      sessionColor: string;
      theme: string;
      transcriptPath: string;
    };
  }
}
