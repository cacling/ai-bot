/**
 * Test preload — mock km-client for all unit tests
 *
 * Bun loads this before any test file, ensuring km-client's module-level
 * cache is initialized with mock data (not real HTTP calls).
 *
 * Usage: bun test --preload tests/unittest/preload.ts tests/unittest/
 */
import { mock } from 'bun:test';

const mockServers = [
  { id: 'srv_1', name: 'internal-service', url: 'http://localhost:18003/mcp', enabled: true, status: 'active', transport: 'http', kind: 'internal', disabled_tools: null, mock_rules: null, tools_json: null, mocked_tools: null },
];

const mockTools = [
  { id: 'tool_qs', name: 'query_subscriber', description: 'Query subscriber', input_schema: '{"type":"object","properties":{"phone":{"type":"string"}}}', output_schema: null, mocked: false, disabled: false, mock_rules: null, server_id: 'srv_1', annotations: null },
  { id: 'tool_qb', name: 'query_bill', description: 'Query bill', input_schema: '{"type":"object","properties":{"phone":{"type":"string"}}}', output_schema: null, mocked: false, disabled: false, mock_rules: null, server_id: 'srv_1', annotations: null },
  { id: 'tool_mock', name: 'mocked_tool', description: 'A mocked tool', input_schema: '{"type":"object"}', output_schema: null, mocked: true, disabled: false, mock_rules: JSON.stringify([{ tool_name: 'mocked_tool', match: '*', response: '{"mock":true}' }]), server_id: 'srv_1', annotations: null },
  { id: 'tool_ass', name: 'apply_service_suspension', description: 'Apply suspension', input_schema: '{"type":"object","properties":{"phone":{"type":"string"}}}', output_schema: null, mocked: true, disabled: false, mock_rules: JSON.stringify([{ tool_name: 'apply_service_suspension', match: '*', response: '{"suspended":true}' }]), server_id: 'srv_1', annotations: null },
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

const resolve = require('path').resolve;
const KM_CLIENT_PATH = resolve(__dirname, '../../src/services/km-client.ts');

mock.module(KM_CLIENT_PATH, () => ({
  // Skill cache
  getSkillRegistry: async () => [],
  getSkillRegistrySync: () => [],
  getWorkflowSpec: async () => null,
  getWorkflowSpecSync: () => null,
  syncSkillMetadata: async () => true,
  insertWorkflowSpec: async () => true,
  invalidateSkillCache: () => {},

  // MCP cache
  getMcpServers: async () => mockServers,
  getMcpServersSync: () => mockServers,
  getMcpTools: async () => mockTools,
  getMcpToolsSync: () => mockTools,
  getMcpToolBindings: async () => mockBindings,
  getMcpToolBindingsSync: () => mockBindings,
  invalidateMcpCache: () => {},

  // Tools overview (existing)
  getToolsOverview: async () => [],
  getToolsOverviewSync: () => [],
  getToolDetail: async () => null,
  warmToolsCache: async () => {},
  warmAllCaches: async () => {},

  // Copilot (existing)
  buildReplyHints: async () => null,
  buildCopilotContext: async () => null,
  askKnowledgeBase: async () => null,
}));
