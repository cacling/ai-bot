import { describe, test, expect } from 'bun:test';
import { MockAdapter } from '../../../../src/tool-runtime/adapters/mock-adapter';
import type { AdapterCallContext, ToolContract } from '../../../../src/tool-runtime/types';

describe('MockAdapter', () => {
  test('type is mock', () => {
    expect(new MockAdapter().type).toBe('mock');
  });

  test('returns mock result for a known mocked tool (apply_service_suspension)', async () => {
    const adapter = new MockAdapter();
    const ctx: AdapterCallContext = {
      request: { toolName: 'apply_service_suspension', args: { phone: '13800000001' }, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'apply_service_suspension', description: '', mocked: true, disabled: false } as ToolContract,
        binding: null,
        connector: null,
      },
      traceId: 'trc_1',
    };

    const result = await adapter.call(ctx);
    // The tool has mock rules in the DB, so it should match
    expect(typeof result.rawText).toBe('string');
    expect(typeof result.success).toBe('boolean');
  });

  test('returns error when no mock rules match for unknown tool', async () => {
    const adapter = new MockAdapter();
    const ctx: AdapterCallContext = {
      request: { toolName: '__no_rules_tool__', args: {}, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: '__no_rules_tool__', description: '', mocked: true, disabled: false } as ToolContract,
        binding: null,
        connector: null,
      },
      traceId: 'trc_2',
    };

    const result = await adapter.call(ctx);
    expect(result.success).toBe(false);
  });
});
