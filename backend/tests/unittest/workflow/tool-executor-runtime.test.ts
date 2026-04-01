/**
 * Tests for tool-executor.ts runtime branch (Phase 3 integration)
 * Verifies that tool-executor prefers ToolRuntime when _toolRuntime is injected.
 */
import '../tool-runtime/_mock-km-client';
import { describe, test, expect } from 'bun:test';
import { toolExecutor } from '../../../src/workflow/executors/tool-executor';
import { ToolRuntime } from '../../../src/tool-runtime';

describe('toolExecutor with ToolRuntime', () => {
  test('uses _toolRuntime when injected into context', async () => {
    const runtime = new ToolRuntime();
    const node = {
      id: 'n1',
      type: 'tool' as const,
      config: { toolRef: 'apply_service_suspension', outputKey: 'result' },
      ports: [],
    };
    const context = {
      executionId: 'exec_1',
      input: { phone: '13800000001' } as Record<string, unknown>,
      vars: {} as Record<string, unknown>,
      _toolRuntime: runtime,
    };

    const result = await toolExecutor.execute({ node: node as any, context: context as any });
    // apply_service_suspension is mocked — should succeed
    expect(result.status).toBe('success');
    expect(result.outputs.result).toBeDefined();
    expect(result.nextPortIds).toContain('out');
  });

  test('falls back to _mcpTools when no _toolRuntime', async () => {
    const node = {
      id: 'n2',
      type: 'tool' as const,
      config: { toolRef: '__missing_tool__', outputKey: 'result' },
      ports: [],
    };
    const context = {
      executionId: 'exec_2',
      input: { phone: '138' } as Record<string, unknown>,
      vars: {} as Record<string, unknown>,
      _mcpTools: {}, // empty tools — tool not found
    };

    const result = await toolExecutor.execute({ node: node as any, context: context as any });
    expect(result.status).toBe('error');
    expect(result.nextPortIds).toContain('error');
  });

  test('runtime result populates context.vars with outputKey', async () => {
    const runtime = new ToolRuntime();
    const node = {
      id: 'n3',
      type: 'tool' as const,
      config: { toolRef: 'apply_service_suspension', outputKey: 'susResult' },
      ports: [],
    };
    const vars: Record<string, unknown> = {};
    const context = {
      executionId: 'exec_3',
      input: { phone: '13800000001' } as Record<string, unknown>,
      vars,
      _toolRuntime: runtime,
    };

    await toolExecutor.execute({ node: node as any, context: context as any });
    expect(vars.susResult).toBeDefined();
  });
});
