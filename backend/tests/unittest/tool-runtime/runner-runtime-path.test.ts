/**
 * Tests for runner.ts runtime path
 * Verifies that the runtime produces correct tool surface.
 */
import './_mock-km-client';
import { describe, test, expect } from 'bun:test';
import { ToolRuntime } from '../../../src/tool-runtime';

describe('runner.ts runtime path', () => {
  test('ToolRuntime produces tool surface compatible with AI SDK', () => {
    const runtime = new ToolRuntime();
    const surface = runtime.getToolSurface();

    expect(surface.length).toBeGreaterThan(0);
    for (const tool of surface) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.disabled).toBe(false);
    }
  });

  test('ToolRuntime routes mocked tools through mock adapter', async () => {
    const runtime = new ToolRuntime();
    // apply_service_suspension is mocked
    const result = await runtime.call({
      toolName: 'apply_service_suspension',
      args: { phone: '13800000001' },
      channel: 'online',
      sessionId: 'test_runner',
    });
    expect(result.success).toBe(true);
    expect(result.source).toBe('mock');
  });

  test('callWithPolicies does not leak policies to subsequent calls', async () => {
    const runtime = new ToolRuntime();
    const surface = runtime.getToolSurface();
    if (surface.length === 0) return;

    // Call with blocking policy
    const blocked = await runtime.callWithPolicies({
      toolName: surface[0].name,
      args: {},
      channel: 'online',
      sessionId: 'test_leak_1',
    }, [{ name: 'blocker', check: () => 'Blocked' }]);
    expect(blocked.errorCode).toBe('POLICY_REJECTED');

    // Next call should not be blocked
    const unblocked = await runtime.call({
      toolName: surface[0].name,
      args: {},
      channel: 'online',
      sessionId: 'test_leak_2',
    });
    expect(unblocked.errorCode).not.toBe('POLICY_REJECTED');
  });
});
