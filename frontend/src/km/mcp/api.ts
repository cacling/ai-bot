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
  mocked_tools: string | null;
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
  scene_name?: string; // human-readable scenario name
  match: string;       // JS expression or '' for default
  response: string;    // JSON string
}

export interface McpResource {
  id: string;
  server_id: string;
  name: string;
  type: 'db' | 'api' | 'remote_mcp';
  status: 'active' | 'planned' | 'disabled';
  db_mode: string | null;
  mcp_transport: string | null;
  mcp_url: string | null;
  mcp_headers: string | null;
  api_base_url: string | null;
  api_headers: string | null;
  api_timeout: number | null;
  env_json: string | null;
  env_prod_json: string | null;
  env_test_json: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface McpToolRecord {
  id: string;
  name: string;
  description: string;
  server_id: string | null;
  /** Real 实现类型：'script' | 'db' | 'api' | null */
  impl_type: string | null;
  /** 脚本模式：handler key */
  handler_key: string | null;
  input_schema: string | null;
  /** 输出 Schema（JSON Schema） */
  output_schema: string | null;
  execution_config: string | null;
  mock_rules: string | null;
  mocked: boolean;
  disabled: boolean;
  response_example: string | null;
  created_at: string;
  updated_at: string;
  /** 输出 Schema 实际内容（GET /:id 时从文件读取） */
  output_schema_content?: Record<string, unknown> | null;
  // 附加字段（API 返回）
  skills?: string[];
  resource?: { id: string; name: string; type: string } | null;
}

export interface McpHandler {
  key: string;
  tool_name: string;
  server_name: string;
  server_id: string;
  file: string;
}

export interface ToolOverviewItem {
  name: string;
  description: string;
  source: string;
  source_type: 'mcp' | 'builtin' | 'local';
  status: 'available' | 'disabled' | 'planned';
  skills: string[];
}

export interface ServerHealthInfo {
  server_id: string;
  server_name: string;
  status: string;
  enabled: boolean;
  last_connected_at: string | null;
  resources: Array<{ id: string; name: string; type: string; status: string }>;
  resource_count: number;
  tools: {
    total: number;
    ready: number;
    mocked: number;
    disabled: number;
    unconfigured: number;
  };
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

  // Server health
  getServerHealth: (id: string) =>
    request<ServerHealthInfo>(`/servers/${id}/health`),

  // Tools overview (legacy aggregation)
  getToolsOverview: () =>
    request<{ items: ToolOverviewItem[] }>('/tools'),

  // Resources
  listResources: (serverId?: string) =>
    request<{ items: McpResource[] }>(serverId ? `/resources?server_id=${serverId}` : '/resources'),
  getResource: (id: string) => request<McpResource>(`/resources/${id}`),
  createResource: (body: Partial<McpResource>) =>
    request<{ id: string }>('/resources', { method: 'POST', body: JSON.stringify(body) }),
  updateResource: (id: string, body: Partial<McpResource>) =>
    request<{ ok: boolean }>(`/resources/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteResource: (id: string) =>
    request<{ ok: boolean }>(`/resources/${id}`, { method: 'DELETE' }),
  discoverFromResource: (id: string) =>
    request<{ tools: number; created: number; updated: number }>(`/resources/${id}/discover`, { method: 'POST' }),
  testResource: (id: string) =>
    request<{ ok: boolean; error?: string; elapsed_ms?: number; tools_count?: number; tables_count?: number; http_status?: number }>(`/resources/${id}/test`, { method: 'POST' }),

  // Tool management (独立 CRUD)
  listTools: (serverId?: string) =>
    request<{ items: McpToolRecord[] }>(serverId ? `/tool-management?server_id=${serverId}` : '/tool-management'),
  getTool: (id: string) => request<McpToolRecord>(`/tool-management/${id}`),
  createTool: (body: Partial<McpToolRecord>) =>
    request<{ id: string }>('/tool-management', { method: 'POST', body: JSON.stringify(body) }),
  updateTool: (id: string, body: Partial<McpToolRecord>) =>
    request<{ ok: boolean }>(`/tool-management/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTool: (id: string) =>
    request<{ ok: boolean }>(`/tool-management/${id}`, { method: 'DELETE' }),
  updateExecutionConfig: (id: string, config: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/tool-management/${id}/execution-config`, { method: 'PUT', body: JSON.stringify(config) }),
  updateToolMockRules: (id: string, rules: MockRule[]) =>
    request<{ ok: boolean }>(`/tool-management/${id}/mock-rules`, { method: 'PUT', body: JSON.stringify({ rules }) }),
  toggleToolMock: (id: string) =>
    request<{ ok: boolean; mocked: boolean }>(`/tool-management/${id}/toggle-mock`, { method: 'PUT' }),

  // Handlers
  listHandlers: () =>
    request<{ handlers: McpHandler[] }>('/tool-management/handlers'),

  // SQL preview
  sqlPreview: (id: string, config: { table: string; operation: string; where?: Array<{ param: string; column: string; op?: string }>; columns?: string[] }) =>
    request<{ sql: string }>(`/tool-management/${id}/sql-preview`, { method: 'POST', body: JSON.stringify(config) }),

  // Output schema validation
  validateOutput: (id: string, data: unknown) =>
    request<{ valid: boolean; errors?: string[] }>(`/tool-management/${id}/validate-output`, { method: 'POST', body: JSON.stringify({ data }) }),

  // Infer schema from example
  inferSchema: (example: unknown) =>
    request<{ schema: Record<string, unknown> }>('/tool-management/infer-schema', { method: 'POST', body: JSON.stringify({ example }) }),
};
