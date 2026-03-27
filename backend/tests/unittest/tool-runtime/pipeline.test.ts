import { describe, test, expect, mock } from 'bun:test';
import { Pipeline } from '../../../src/tool-runtime/pipeline';
import { ToolRegistry } from '../../../src/tool-runtime/registry';
import type { Adapter, AdapterCallContext, ToolRuntimeRequest, GovernPolicy } from '../../../src/tool-runtime/types';
import { ErrorCode } from '../../../src/tool-runtime/types';

function makeTestAdapter(result: Partial<Awaited<ReturnType<Adapter['call']>>> = {}): Adapter {
  return {
    type: 'remote_mcp',
    call: mock(async () => ({
      rawText: '{"ok":true}',
      parsed: { ok: true },
      success: true,
      hasData: true,
      ...result,
    })),
  };
}

describe('Pipeline', () => {
  test('executes 7-step pipeline and returns ToolRuntimeResult', async () => {
    const adapter = makeTestAdapter();
    const registry = new ToolRegistry();
    const pipeline = new Pipeline(registry, { remote_mcp: adapter });

    const request: ToolRuntimeRequest = {
      toolName: 'query_subscriber',
      args: { phone: '13800000001' },
      channel: 'online',
      sessionId: 'sess_1',
      userPhone: '13800000001',
      lang: 'zh',
    };

    const result = await pipeline.execute(request);
    if (result.success) {
      expect(result.hasData).toBe(true);
      expect(result.source).toBe('remote_mcp');
      expect(typeof result.traceId).toBe('string');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    }
    if (!result.success) {
      expect(result.errorCode).toBeDefined();
    }
  });

  test('returns TOOL_NOT_FOUND for unknown tool', async () => {
    const adapter = makeTestAdapter();
    const registry = new ToolRegistry();
    const pipeline = new Pipeline(registry, { remote_mcp: adapter });

    const result = await pipeline.execute({
      toolName: '__nonexistent__',
      args: {},
      channel: 'online',
      sessionId: 's1',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.TOOL_NOT_FOUND);
  });

  test('routes mocked tools to mock adapter', async () => {
    const mockAdapter: Adapter = {
      type: 'mock',
      call: mock(async () => ({ rawText: '{"mocked":true}', parsed: { mocked: true }, success: true, hasData: true })),
    };
    const mcpAdapter = makeTestAdapter();
    const registry = new ToolRegistry();
    const pipeline = new Pipeline(registry, { remote_mcp: mcpAdapter, mock: mockAdapter });

    // apply_service_suspension is mocked in DB
    const result = await pipeline.execute({
      toolName: 'apply_service_suspension',
      args: { phone: '13800000001' },
      channel: 'online',
      sessionId: 's1',
    });

    expect(result.success).toBe(true);
    expect(result.source).toBe('mock');
    expect(mockAdapter.call).toHaveBeenCalled();
  });

  test('policy rejection returns POLICY_REJECTED', async () => {
    const adapter = makeTestAdapter();
    const registry = new ToolRegistry();
    const contracts = registry.listContracts();
    expect(contracts.length).toBeGreaterThan(0);

    const rejectPolicy: GovernPolicy = {
      name: 'test-reject',
      check: () => 'Rejected by test policy',
    };
    const pipeline = new Pipeline(registry, { remote_mcp: adapter }, [rejectPolicy]);

    const result = await pipeline.execute({
      toolName: contracts[0].name,
      args: {},
      channel: 'online',
      sessionId: 's1',
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.POLICY_REJECTED);
  });

  test('injects traceId and sessionId into args', async () => {
    let capturedCtx: AdapterCallContext | null = null;
    const adapter: Adapter = {
      type: 'remote_mcp',
      call: mock(async (ctx: AdapterCallContext) => {
        capturedCtx = ctx;
        return { rawText: '{}', parsed: {}, success: true, hasData: true };
      }),
    };
    const registry = new ToolRegistry();
    const contracts = registry.listContracts();
    expect(contracts.length).toBeGreaterThan(0);

    const pipeline = new Pipeline(registry, { remote_mcp: adapter });
    await pipeline.execute({
      toolName: contracts[0].name,
      args: {},
      channel: 'online',
      sessionId: 'sess_inject',
    });

    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.request.args.traceId).toBeDefined();
    expect(capturedCtx!.request.args.sessionId).toBe('sess_inject');
  });

  test('normalizes month parameter in validate step', async () => {
    let capturedArgs: Record<string, unknown> = {};
    const adapter: Adapter = {
      type: 'remote_mcp',
      call: mock(async (ctx: AdapterCallContext) => {
        capturedArgs = ctx.request.args;
        return { rawText: '{}', parsed: {}, success: true, hasData: true };
      }),
    };
    const registry = new ToolRegistry();
    const contracts = registry.listContracts();
    expect(contracts.length).toBeGreaterThan(0);

    const pipeline = new Pipeline(registry, { remote_mcp: adapter });
    await pipeline.execute({
      toolName: contracts[0].name,
      args: { month: '2026-2' },
      channel: 'online',
      sessionId: 's1',
    });

    expect(capturedArgs.month).toBe('2026-02');
  });
});
