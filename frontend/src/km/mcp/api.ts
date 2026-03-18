/**
 * MCP 管理 API 客户端
 */
const BASE = '/api/mcp';

async function request<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export interface McpServer {
  id: string;
  name: string;
  description: string;
  transport: 'http' | 'stdio' | 'sse';
  status: 'active' | 'planned';
  enabled: boolean;
  url: string | null;
  headers_json: string | null;
  command: string | null;
  args_json: string | null;
  cwd: string | null;
  env_json: string | null;
  env_prod_json: string | null;
  env_test_json: string | null;
  tools_json: string | null;
  disabled_tools: string | null;
  mock_rules: string | null;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema?: unknown;
  parameters?: Array<{ name: string; type: string; required: boolean; description: string; enum?: string[] }>;
  responseExample?: string;
}

export interface ToolParam {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
  enum?: string[];
}

export interface ManualTool {
  name: string;
  description: string;
  parameters: ToolParam[];
  responseExample: string;
}

export interface MockRule {
  tool_name: string;
  match: string;      // JS expression or '' for default
  response: string;   // JSON string
}

export interface ToolOverviewItem {
  name: string;
  description: string;
  source: string;
  source_type: 'mcp' | 'builtin' | 'local';
  status: 'available' | 'disabled' | 'planned';
  skills: string[];
}

export const mcpApi = {
  // Servers
  listServers: (params?: Record<string, string>) =>
    request<{ items: McpServer[] }>(`/servers?${new URLSearchParams(params)}`),
  getServer: (id: string) => request<McpServer>(`/servers/${id}`),
  createServer: (body: Partial<McpServer>) =>
    request<{ id: string }>('/servers', { method: 'POST', body: JSON.stringify(body) }),
  updateServer: (id: string, body: Partial<McpServer>) =>
    request<{ ok: boolean }>(`/servers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteServer: (id: string) =>
    request<{ ok: boolean }>(`/servers/${id}`, { method: 'DELETE' }),
  discoverTools: (id: string) =>
    request<{ tools: McpToolInfo[] }>(`/servers/${id}/discover`, { method: 'POST' }),
  invokeTool: (id: string, toolName: string, args: Record<string, unknown>) =>
    request<{ result: unknown; elapsed_ms: number }>(`/servers/${id}/invoke`, {
      method: 'POST',
      body: JSON.stringify({ tool_name: toolName, arguments: args }),
    }),
  mockInvokeTool: (id: string, toolName: string, args: Record<string, unknown>) =>
    request<{ result: unknown; elapsed_ms: number; mock: boolean; matched_rule: string }>(`/servers/${id}/mock-invoke`, {
      method: 'POST',
      body: JSON.stringify({ tool_name: toolName, arguments: args }),
    }),

  // Tools overview
  getToolsOverview: () =>
    request<{ items: ToolOverviewItem[] }>('/tools'),
};
