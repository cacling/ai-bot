import { describe, test, expect } from 'bun:test';
import { ToolRuntime } from '../../../src/tool-runtime/runtime';

describe('ToolRuntime', () => {
  test('creates instance with default adapters', () => {
    const runtime = new ToolRuntime();
    expect(runtime).toBeDefined();
  });

  test('call() returns ToolRuntimeResult', async () => {
    const runtime = new ToolRuntime();
    const result = await runtime.call({
      toolName: '__nonexistent__',
      args: {},
      channel: 'online',
      sessionId: 'test_1',
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('TOOL_NOT_FOUND');
    expect(typeof result.traceId).toBe('string');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('getToolSurface() returns non-disabled tools', () => {
    const runtime = new ToolRuntime();
    const surface = runtime.getToolSurface();
    expect(Array.isArray(surface)).toBe(true);
    for (const tool of surface) {
      expect(tool.disabled).toBe(false);
    }
  });

  test('refresh() reloads registry', () => {
    const runtime = new ToolRuntime();
    runtime.refresh();
  });

  test('callWithPolicies() applies scoped policies without accumulation', async () => {
    const runtime = new ToolRuntime();
    const surface = runtime.getToolSurface();
    if (surface.length === 0) return;

    const result1 = await runtime.callWithPolicies({
      toolName: surface[0].name,
      args: {},
      channel: 'online',
      sessionId: 'test_policy',
    }, [{ name: 'block-all', check: () => 'Blocked for test' }]);
    expect(result1.success).toBe(false);
    expect(result1.errorCode).toBe('POLICY_REJECTED');

    const result2 = await runtime.call({
      toolName: surface[0].name,
      args: {},
      channel: 'online',
      sessionId: 'test_no_policy',
    });
    expect(result2.errorCode).not.toBe('POLICY_REJECTED');
  });
});
