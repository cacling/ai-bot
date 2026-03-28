import { describe, test, expect, mock } from 'bun:test';
import { RemoteMcpAdapter } from '../../../../src/tool-runtime/adapters/remote-mcp-adapter';
import type { AdapterCallContext, ToolContract, ToolBinding } from '../../../../src/tool-runtime/types';

describe('RemoteMcpAdapter', () => {
  test('type is remote_mcp', () => {
    const adapter = new RemoteMcpAdapter();
    expect(adapter.type).toBe('remote_mcp');
  });

  test('call returns parsed MCP result on success', async () => {
    const adapter = new RemoteMcpAdapter();
    const mockExecute = mock(async () => ({
      content: [{ type: 'text', text: '{"found":true,"name":"test"}' }],
    }));
    adapter.setMcpTools({ test_tool: { execute: mockExecute } });

    const ctx: AdapterCallContext = {
      request: { toolName: 'test_tool', args: { phone: '138' }, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'test_tool', description: '', mocked: false, disabled: false } as ToolContract,
        binding: { toolId: '1', adapterType: 'remote_mcp', status: 'active' } as ToolBinding,
        connector: null,
      },
      traceId: 'trc_1',
    };

    const result = await adapter.call(ctx);
    expect(result.success).toBe(true);
    expect(result.hasData).toBe(true);
    expect((result.parsed as any).found).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith({ phone: '138' });
  });

  test('call returns error when tool not in MCP pool', async () => {
    const adapter = new RemoteMcpAdapter();
    adapter.setMcpTools({});

    const ctx: AdapterCallContext = {
      request: { toolName: 'missing', args: {}, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'missing', description: '', mocked: false, disabled: false } as ToolContract,
        binding: null,
        connector: null,
      },
      traceId: 'trc_2',
    };

    const result = await adapter.call(ctx);
    expect(result.success).toBe(false);
  });
});
