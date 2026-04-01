/**
 * Shared km-client mock for tool-runtime tests.
 *
 * Must be imported BEFORE any module that uses km-client (e.g. ToolRegistry).
 * Usage: import './_mock-km-client' at the top of test files.
 */
import { mock } from 'bun:test';

const mockTools = [
  { id: 'tool_qs', name: 'query_subscriber', description: 'Query subscriber', input_schema: '{"type":"object","properties":{"phone":{"type":"string"}}}', output_schema: null, mocked: false, disabled: false, mock_rules: null, server_id: 'srv_1', annotations: null },
  { id: 'tool_qb', name: 'query_bill', description: 'Query bill', input_schema: '{"type":"object","properties":{"phone":{"type":"string"},"month":{"type":"string"}}}', output_schema: null, mocked: false, disabled: false, mock_rules: null, server_id: 'srv_1', annotations: null },
  { id: 'tool_mock', name: 'mocked_tool', description: 'A mocked tool', input_schema: '{"type":"object"}', output_schema: null, mocked: true, disabled: false, mock_rules: JSON.stringify([{ tool_name: 'mocked_tool', match: '*', response: '{"mock":true}' }]), server_id: 'srv_1', annotations: null },
  { id: 'tool_ass', name: 'apply_service_suspension', description: 'Apply suspension', input_schema: '{"type":"object","properties":{"phone":{"type":"string"}}}', output_schema: null, mocked: true, disabled: false, mock_rules: JSON.stringify([{ tool_name: 'apply_service_suspension', match: '*', response: '{"suspended":true}' }]), server_id: 'srv_1', annotations: null },
];

const mockServers = [
  { id: 'srv_1', name: 'internal-service', url: 'http://localhost:18003/mcp', enabled: true, status: 'active', transport: 'http', kind: 'internal', disabled_tools: null, mock_rules: null, tools_json: null, mocked_tools: null },
];

const mockBindings = {
  implementations: [
    { id: 'impl_1', tool_id: 'tool_qs', adapter_type: 'script', connector_id: 'conn_1', handler_key: null, config: null, status: 'active' },
    { id: 'impl_2', tool_id: 'tool_qb', adapter_type: 'script', connector_id: 'conn_1', handler_key: null, config: null, status: 'active' },
    { id: 'impl_3', tool_id: 'tool_mock', adapter_type: 'mock', connector_id: null, handler_key: null, config: null, status: 'active' },
    { id: 'impl_4', tool_id: 'tool_ass', adapter_type: 'mock', connector_id: null, handler_key: null, config: null, status: 'active' },
  ],
  connectors: [
    { id: 'conn_1', name: 'default', type: 'api', config: '{"baseUrl":"http://localhost:18008"}', status: 'active' },
  ],
};

mock.module('../../../src/services/km-client', () => ({
  getMcpServersSync: () => mockServers,
  getMcpToolsSync: () => mockTools,
  getMcpToolBindingsSync: () => mockBindings,
  getMcpServers: async () => mockServers,
  getMcpTools: async () => mockTools,
  getMcpToolBindings: async () => mockBindings,
  getSkillRegistrySync: () => [],
  getWorkflowSpecSync: () => null,
  getWorkflowSpec: async () => null,
  getSkillRegistry: async () => [],
  getToolsOverview: async () => [],
  getToolsOverviewSync: () => [],
  warmToolsCache: async () => {},
  warmAllCaches: async () => {},
  invalidateSkillCache: () => {},
  invalidateMcpCache: () => {},
}));
