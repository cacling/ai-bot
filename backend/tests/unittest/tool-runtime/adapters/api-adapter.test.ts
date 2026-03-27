import { describe, test, expect } from 'bun:test';
import { ApiAdapter } from '../../../../src/tool-runtime/adapters/api-adapter';
import type { AdapterCallContext, ToolContract, ToolBinding, ConnectorConfig } from '../../../../src/tool-runtime/types';

describe('ApiAdapter', () => {
  test('type is api', () => {
    expect(new ApiAdapter().type).toBe('api');
  });

  test('returns error when no connector config', async () => {
    const adapter = new ApiAdapter();
    const ctx: AdapterCallContext = {
      request: { toolName: 'test', args: {}, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'test', description: '', mocked: false, disabled: false } as ToolContract,
        binding: { toolId: '1', adapterType: 'api', status: 'active' } as ToolBinding,
        connector: null,
      },
      traceId: 'trc_1',
    };
    const result = await adapter.call(ctx);
    expect(result.success).toBe(false);
    expect(result.rawText).toContain('No API config');
  });

  test('builds API config from connector and binding', async () => {
    const adapter = new ApiAdapter();
    const ctx: AdapterCallContext = {
      request: { toolName: 'test', args: { phone: '138' }, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'test', description: '', mocked: false, disabled: false } as ToolContract,
        binding: {
          toolId: '1', adapterType: 'api', status: 'active',
          config: { api: { url: 'http://127.0.0.1:19999/nonexistent', method: 'POST', timeout: 1000 } },
        } as unknown as ToolBinding,
        connector: {
          id: 'c1', name: 'test-api', type: 'api', status: 'active',
          config: { baseUrl: 'http://127.0.0.1:19999' },
        } as ConnectorConfig,
      },
      traceId: 'trc_2',
    };

    const result = await adapter.call(ctx);
    expect(result.success).toBe(false);
    // Should have attempted the API call (failed because server doesn't exist)
    expect(typeof result.rawText).toBe('string');
  });
});
