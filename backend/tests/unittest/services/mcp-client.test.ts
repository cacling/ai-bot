/**
 * mcp-client.test.ts — Tests for MCP client module
 */
import { describe, test, expect } from 'bun:test';
import { callMcpTool } from '../../../src/services/mcp-client';

describe('mcp-client — callMcpTool', () => {
  test('module exports callMcpTool function', () => {
    expect(typeof callMcpTool).toBe('function');
  });

  test('returns error result when tool not found or MCP server unreachable', async () => {
    const result = await callMcpTool('test-session', 'test_tool', { arg1: 'value' });
    // Should return an error result (not throw)
    expect(result.success).toBe(false);
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
  });

  test('returns object with text and success fields', async () => {
    const result = await callMcpTool('test-session-2', 'nonexistent_tool', {});
    expect('text' in result).toBe(true);
    expect('success' in result).toBe(true);
    expect(typeof result.text).toBe('string');
    expect(typeof result.success).toBe('boolean');
  });

  test('handles empty args', async () => {
    const result = await callMcpTool('test-session-3', 'test', {});
    expect(result.success).toBe(false);
  });
});
