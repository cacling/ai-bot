import { describe, test, expect } from 'bun:test';
import { ScriptAdapter } from '../../../../src/tool-runtime/adapters/script-adapter';
import type { AdapterCallContext, ToolContract, ToolBinding } from '../../../../src/tool-runtime/types';

describe('ScriptAdapter', () => {
  test('type is script', () => {
    expect(new ScriptAdapter().type).toBe('script');
  });

  test('returns error when no handler key', async () => {
    const adapter = new ScriptAdapter();
    const ctx: AdapterCallContext = {
      request: { toolName: 'test', args: {}, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'test', description: '', mocked: false, disabled: false } as ToolContract,
        binding: { toolId: '1', adapterType: 'script', status: 'active' } as ToolBinding,
        connector: null,
      },
      traceId: 'trc_1',
    };
    const result = await adapter.call(ctx);
    expect(result.success).toBe(false);
    expect(result.rawText).toContain('No handler');
  });
});
