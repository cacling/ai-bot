import { describe, test, expect, beforeEach, mock } from 'bun:test';

// Mock km-client before importing registry
const mockTools = [
  { id: 'tool_1', name: 'query_subscriber', description: 'Query subscriber', input_schema: '{"type":"object"}', output_schema: null, mocked: false, disabled: false, mock_rules: null, server_id: 'srv_1', annotations: null },
  { id: 'tool_2', name: 'query_bill', description: 'Query bill', input_schema: null, output_schema: null, mocked: true, disabled: false, mock_rules: null, server_id: 'srv_1', annotations: null },
  { id: 'tool_3', name: 'disabled_tool', description: 'Disabled', input_schema: null, output_schema: null, mocked: false, disabled: true, mock_rules: null, server_id: 'srv_1', annotations: null },
];

const mockServers = [
  { id: 'srv_1', name: 'internal-service', url: 'http://localhost:18003/mcp', enabled: true, status: 'active', transport: 'http', kind: 'internal', disabled_tools: null, mock_rules: null, tools_json: null },
];

const mockBindings = {
  implementations: [
    { id: 'impl_1', tool_id: 'tool_1', adapter_type: 'mcp', connector_id: 'conn_1', handler_key: null, config: null, status: 'active' },
  ],
  connectors: [
    { id: 'conn_1', name: 'default', type: 'api', config: '{"baseUrl":"http://localhost:18008"}', status: 'active' },
  ],
};

mock.module('../../../src/services/km-client', () => ({
  getMcpServersSync: () => mockServers,
  getMcpToolsSync: () => mockTools,
  getMcpToolBindingsSync: () => mockBindings,
}));

const { ToolRegistry } = await import('../../../src/tool-runtime/registry');

describe('ToolRegistry', () => {
  let registry: InstanceType<typeof ToolRegistry>;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  test('resolves a known tool', () => {
    const resolved = registry.resolve('query_subscriber');
    expect(resolved).not.toBeNull();
    expect(resolved!.contract.name).toBe('query_subscriber');
  });

  test('returns null for unknown tool', () => {
    expect(registry.resolve('__nonexistent__')).toBeNull();
  });

  test('lists all contracts', () => {
    const all = registry.listContracts();
    expect(all.length).toBe(3);
  });

  test('filters disabled tools from surface', () => {
    const surface = registry.getToolSurface();
    for (const tool of surface) {
      expect(tool.disabled).toBe(false);
    }
    expect(surface.length).toBe(2);
  });

  test('refresh clears cache and reloads', () => {
    const before = registry.listContracts().length;
    registry.refresh();
    expect(registry.listContracts().length).toBe(before);
  });

  test('resolves binding and connector', () => {
    const resolved = registry.resolve('query_subscriber');
    expect(resolved).not.toBeNull();
    expect(resolved!.binding).not.toBeNull();
    expect(resolved!.connector).not.toBeNull();
    expect(resolved!.connector!.name).toBe('default');
  });
});
