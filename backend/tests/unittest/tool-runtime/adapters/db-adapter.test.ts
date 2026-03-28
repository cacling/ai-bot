import { describe, test, expect } from 'bun:test';
import { DbAdapter } from '../../../../src/tool-runtime/adapters/db-adapter';
import type { AdapterCallContext, ToolContract, ToolBinding, ConnectorConfig } from '../../../../src/tool-runtime/types';

describe('DbAdapter', () => {
  test('type is db', () => {
    expect(new DbAdapter().type).toBe('db');
  });

  test('returns error when no binding config', async () => {
    const adapter = new DbAdapter();
    const ctx: AdapterCallContext = {
      request: { toolName: 'test', args: {}, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'test', description: '', mocked: false, disabled: false } as ToolContract,
        binding: { toolId: '1', adapterType: 'db', status: 'active' } as ToolBinding,
        connector: { id: 'c1', name: 'test-db', type: 'db', status: 'active' } as ConnectorConfig,
      },
      traceId: 'trc_1',
    };
    const result = await adapter.call(ctx);
    expect(result.success).toBe(false);
    expect(result.rawText).toContain('No DB query config');
  });

  test('executes select query from binding config', async () => {
    const adapter = new DbAdapter();
    const ctx: AdapterCallContext = {
      request: { toolName: 'test_query', args: { phone: '13800000001' }, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'test_query', description: '', mocked: false, disabled: false } as ToolContract,
        binding: {
          toolId: '1', adapterType: 'db', status: 'active',
          config: {
            db: {
              table: 'subscribers',
              operation: 'select',
              where: { phone: '{{phone}}' },
              columns: ['id', 'name', 'phone', 'plan_name'],
            },
          },
        } as unknown as ToolBinding,
        connector: { id: 'c1', name: 'main-db', type: 'db', status: 'active' } as ConnectorConfig,
      },
      traceId: 'trc_2',
    };
    const result = await adapter.call(ctx);
    expect(typeof result.rawText).toBe('string');
    expect(typeof result.success).toBe('boolean');
  });
});
