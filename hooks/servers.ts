import type { ContextMcpTool } from "claude-code";

export type McpAction = "reconnect" | "disable" | "enable";

export type Server = { name: string; tools: number; tokens: number; loadedTokens: number };

export function serversOf(tools: ContextMcpTool[]): Server[] {
  const byName = new Map<string, Server>();
  for (const tool of tools) {
    const server = byName.get(tool.serverName) ?? {
      name: tool.serverName,
      tools: 0,
      tokens: 0,
      loadedTokens: 0,
    };
    byName.set(tool.serverName, {
      ...server,
      tools: server.tools + 1,
      tokens: server.tokens + tool.tokens,
      loadedTokens: server.loadedTokens + (tool.isLoaded ? tool.tokens : 0),
    });
  }
  return [...byName.values()];
}

export type McpScope = "project" | "local" | "user" | "claudeai" | "dynamic";

export type ScopeIndex = Map<string, McpScope>;

type McpServerMap = { mcpServers?: Record<string, unknown> };
type ProjectConfig = McpServerMap & {
  disabledMcpServers?: string[];
  disabledMcpjsonServers?: string[];
};
type ClaudeConfig = McpServerMap & { projects?: Record<string, ProjectConfig> };

const CLAUDE_AI_NAME = /^claude[. _]ai[ _]/;
const ENGINE_NAME_UNSAFE = /[^\w-]/g;

export function disabledServersOf(configText: string, cwd: string): string[] {
  const project = projectOf(parseConfig(configText), cwd)?.project;
  return [...(project?.disabledMcpServers ?? []), ...(project?.disabledMcpjsonServers ?? [])];
}

export function projectRootOf(configText: string, cwd: string): string {
  return projectOf(parseConfig(configText), cwd)?.root ?? cwd;
}

export function scopeIndexOf(configText: string, projectMcpText: string, cwd: string): ScopeIndex {
  const config = parseConfig(configText);
  const sources: [McpScope, McpServerMap | undefined][] = [
    ["local", projectOf(config, cwd)?.project],
    ["project", parseConfig(projectMcpText)],
    ["user", config],
  ];
  const index: ScopeIndex = new Map();
  for (const [scope, source] of sources) {
    for (const name of Object.keys(source?.mcpServers ?? {})) {
      const engineName = name.replace(ENGINE_NAME_UNSAFE, "_");
      if (!index.has(engineName)) index.set(engineName, scope);
    }
  }
  return index;
}

export function scopeOf(name: string, index: ScopeIndex): McpScope {
  if (CLAUDE_AI_NAME.test(name)) return "claudeai";
  return index.get(name.replace(ENGINE_NAME_UNSAFE, "_")) ?? "dynamic";
}

function parseConfig(text: string): ClaudeConfig {
  try {
    return (JSON.parse(text) as ClaudeConfig | null) ?? {};
  } catch {
    return {};
  }
}

function projectOf(
  config: ClaudeConfig,
  cwd: string,
): { root: string; project: ProjectConfig } | undefined {
  const projects = config.projects ?? {};
  const root = ancestorsOf(cwd).find((path) => path in projects);
  const project = root === undefined ? undefined : projects[root];
  return root === undefined || project === undefined ? undefined : { root, project };
}

function ancestorsOf(path: string): string[] {
  const parts = path.split("/");
  return parts.map((_, index) => parts.slice(0, parts.length - index).join("/") || "/");
}
