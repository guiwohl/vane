import { disabledServersOf, projectRootOf, scopeIndexOf } from "./servers";
import type { ScopeIndex } from "./servers";

export type McpConfig = { disabled: string[]; scopes: ScopeIndex };

const CLAUDE_CONFIG_FILE = ".claude.json";
const PROJECT_MCP_FILE = ".mcp.json";

let configured: McpConfig | null = null;

export function resetMcpConfig(): void {
  configured = null;
}

export async function mcpConfigOf(
  readText: (path: string) => Promise<string>,
  home: string,
  cwd: string,
): Promise<McpConfig> {
  if (configured !== null) return configured;
  const configText = await readText(`${home}/${CLAUDE_CONFIG_FILE}`);
  const projectMcpText = await readText(`${projectRootOf(configText, cwd)}/${PROJECT_MCP_FILE}`);
  configured = {
    disabled: disabledServersOf(configText, cwd),
    scopes: scopeIndexOf(configText, projectMcpText, cwd),
  };
  return configured;
}
