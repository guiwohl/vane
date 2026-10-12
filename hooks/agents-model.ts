import type { AgentNode, AgentStatus, AgentTree, RunningCall } from "../types";
import { singleLine } from "./format";

export type { AgentNode, AgentStatus, AgentTree };
export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};
export type TreeRow = { node: AgentNode; depth: number; isLast: boolean };

export const KEPT_AGENTS = 60;

const UNNAMED_AGENT = "Sub-Agent";

type SpawnInfo = Pick<
  AgentNode,
  "id" | "parentId" | "type" | "description" | "name" | "background" | "model"
> & { at: number };
type StepInfo = { model: string; effort?: string; usage: Usage | null };
type CompletionReason = "answer" | "aborted" | "refusal" | "error";
type ListedStatus = "pending" | "running" | "waiting" | "idle" | "completed" | "failed" | "killed";
type ListedAgent = Pick<AgentNode, "id" | "parentId" | "type" | "description"> & {
  status: ListedStatus;
};

const statusByReason: Record<CompletionReason, AgentStatus> = {
  answer: "done",
  error: "failed",
  refusal: "failed",
  aborted: "stopped",
};

const statusOverrides: Partial<Record<ListedStatus, AgentStatus>> = {
  waiting: "waiting",
  idle: "idle",
  killed: "killed",
  completed: "done",
  failed: "failed",
};

export function spawned(tree: AgentTree, { at, ...fields }: SpawnInfo): AgentTree {
  const node = newNode({ ...fields, status: "running", startedAt: at });
  return { ...tree, [node.id]: node };
}

export function stepped(tree: AgentTree, id: string, s: StepInfo): AgentTree {
  return update(tree, id, (node) => {
    const resumed = resumedNode(node);
    const withModel = { ...resumed, model: s.model, effort: s.effort ?? node.effort };
    if (!s.usage) return withModel;
    const u = s.usage;
    return {
      ...withModel,
      tokensIn: node.tokensIn + u.input_tokens + u.cache_creation_input_tokens,
      tokensOut: node.tokensOut + u.output_tokens,
      ctxTokens:
        u.input_tokens +
        u.cache_read_input_tokens +
        u.cache_creation_input_tokens +
        u.output_tokens,
    };
  });
}

export function toolStarted(tree: AgentTree, id: string, t: RunningCall): AgentTree {
  return update(tree, id, (node) => ({ ...resumedNode(node), running: [...node.running, t] }));
}

export function located(
  tree: AgentTree,
  id: string,
  place: { branch: string; worktree?: string },
): AgentTree {
  return update(tree, id, (node) => {
    const { worktree: _worktree, ...rest } = node;
    return {
      ...rest,
      branch: place.branch,
      ...(place.worktree !== undefined && { worktree: place.worktree }),
    };
  });
}

export function toolEnded(tree: AgentTree, id: string, callId: string): AgentTree {
  return update(tree, id, (node) => ({
    ...node,
    running: node.running.filter((t) => t.callId !== callId),
  }));
}

export function completed(
  tree: AgentTree,
  id: string,
  reason: CompletionReason,
  at: number,
): AgentTree {
  return update(tree, id, (node) => ({
    ...node,
    status: statusByReason[reason],
    endedAt: at,
    running: [],
  }));
}

export function reconciled(tree: AgentTree, list: ListedAgent[], at: number): AgentTree {
  return list.reduce((acc, listed) => {
    const known = acc[listed.id];
    const override = statusOverrides[listed.status];
    if (known) return override ? { ...acc, [listed.id]: { ...known, status: override } } : acc;
    const node = newNode({
      id: listed.id,
      parentId: listed.parentId,
      type: listed.type,
      description: listed.description,
      background: false,
      model: "",
      status: override ?? "running",
      startedAt: at,
    });
    return { ...acc, [listed.id]: node };
  }, tree);
}

export function isRunning(node: AgentNode): boolean {
  return node.status === "running";
}

export function runningOnly(tree: AgentTree): AgentTree {
  return Object.fromEntries(Object.entries(tree).filter(([, node]) => isRunning(node)));
}

export function pruned(tree: AgentTree, max = KEPT_AGENTS): AgentTree {
  const nodes = Object.values(tree);
  const excess = nodes.length - max;
  if (excess <= 0) return tree;
  const dropped = nodes
    .filter((node) => node.endedAt !== undefined)
    .sort((a, b) => a.endedAt! - b.endedAt!)
    .slice(0, excess)
    .map((node) => node.id);
  return Object.fromEntries(Object.entries(tree).filter(([id]) => !dropped.includes(id)));
}

export function visibleRows(tree: AgentTree): TreeRow[] {
  const nodes = Object.values(tree);
  const parentOf = (node: AgentNode) =>
    node.parentId !== undefined && tree[node.parentId] ? node.parentId : undefined;
  const walk = (
    parentId: string | undefined,
    depth: number,
  ): { node: AgentNode; depth: number }[] =>
    nodes
      .filter((node) => parentOf(node) === parentId)
      .sort((a, b) => a.startedAt - b.startedAt)
      .flatMap((node) => [{ node, depth }, ...walk(node.id, depth + 1)]);
  const shown = walk(undefined, 0);
  const lastChildOf = new Map(shown.map(({ node }) => [parentOf(node), node.id]));
  return shown.map(({ node, depth }) => ({
    node,
    depth,
    isLast: lastChildOf.get(parentOf(node)) === node.id,
  }));
}

function newNode(
  fields: Omit<AgentNode, "ctxTokens" | "tokensIn" | "tokensOut" | "running">,
): AgentNode {
  return {
    ...fields,
    description: singleLine(fields.description),
    ...(fields.name !== undefined && { name: singleLine(fields.name) }),
    ctxTokens: 0,
    tokensIn: 0,
    tokensOut: 0,
    running: [],
  };
}

function update(tree: AgentTree, id: string, change: (node: AgentNode) => AgentNode): AgentTree {
  const node = tree[id];
  if (!node) return tree;
  return { ...tree, [id]: change(node) };
}

function resumedNode(node: AgentNode): AgentNode {
  const { endedAt: _endedAt, ...rest } = node;
  return { ...rest, status: "running" };
}

export function nameOf(node: AgentNode): string {
  return node.name || node.type || UNNAMED_AGENT;
}

export function titleOf(node: AgentNode): string {
  return node.description || nameOf(node);
}
