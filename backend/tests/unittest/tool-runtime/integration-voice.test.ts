import { describe, test, expect } from 'bun:test';
import { callMcpTool } from '../../../src/services/mcp-client';

describe('Voice/Outbound via Runtime (integration)', () => {
  test('callMcpTool returns { text, success } for unknown tool', async () => {
    const result = await callMcpTool('test_sess', '__nonexistent__', {});
    expect(typeof result.text).toBe('string');
    expect(result.success).toBe(false);
  });

  test('callMcpTool signature is backward compatible', async () => {
    expect(typeof callMcpTool).toBe('function');
    expect(callMcpTool.length).toBeGreaterThanOrEqual(2);
  });
});
