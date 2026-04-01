import '../tool-runtime/_mock-km-client';
import { describe, test, expect } from 'bun:test';
import { executeTool, executeToolViaRuntime, buildToolArgs } from '../../../src/engine/skill-tool-executor';
import { ToolRuntime } from '../../../src/tool-runtime';

describe('ToolExecutor', () => {
  test('returns error when tool not found', async () => {
    const result = await executeTool('nonexistent', {}, {});
    expect(result.success).toBe(false);
    expect(result.rawText).toContain('not found');
  });

  test('executes tool and parses MCP format', async () => {
    const mockTools = {
      test_tool: {
        execute: async () => ({ content: [{ type: 'text', text: '{"found": true, "name": "test"}' }] }),
      },
    };
    const result = await executeTool('test_tool', {}, mockTools as any);
    expect(result.success).toBe(true);
    expect(result.hasData).toBe(true);
    expect((result.parsed as any).name).toBe('test');
  });

  test('detects error result', async () => {
    const mockTools = {
      fail_tool: {
        execute: async () => ({ content: [{ type: 'text', text: '{"success": false, "error": "timeout"}' }] }),
      },
    };
    const result = await executeTool('fail_tool', {}, mockTools as any);
    expect(result.success).toBe(false);
  });

  test('detects no-data result', async () => {
    const mockTools = {
      empty_tool: {
        execute: async () => ({ content: [{ type: 'text', text: '{"found": false, "message": "未查到记录"}' }] }),
      },
    };
    const result = await executeTool('empty_tool', {}, mockTools as any);
    expect(result.success).toBe(true);
    expect(result.hasData).toBe(false);
  });

  test('buildToolArgs fills phone from context', () => {
    const args = buildToolArgs('test', { phone: '13800000001', sessionId: 's1' });
    expect(args.phone).toBe('13800000001');
  });

  test('buildToolArgs merges existing args', () => {
    const args = buildToolArgs('test', { phone: '13800000001', sessionId: 's1' }, { extra: 'val' });
    expect(args.phone).toBe('13800000001');
    expect(args.extra).toBe('val');
  });
});

describe('executeToolViaRuntime', () => {
  test('returns ToolExecResult shape for unknown tool', async () => {
    const runtime = new ToolRuntime();
    const result = await executeToolViaRuntime(
      '__nonexistent__', {}, runtime,
      { sessionId: 's1', phone: '138' },
    );
    expect(result.success).toBe(false);
    expect(result.hasData).toBe(false);
    expect(typeof result.rawText).toBe('string');
    expect(result.parsed).toBeNull();
  });

  test('returns ToolExecResult shape for mocked tool', async () => {
    const runtime = new ToolRuntime();
    // apply_service_suspension is mocked in DB
    const result = await executeToolViaRuntime(
      'apply_service_suspension', { phone: '13800000001' }, runtime,
      { sessionId: 's1', phone: '13800000001', channel: 'online', activeSkillName: 'test-skill' },
    );
    expect(result.success).toBe(true);
    expect(result.hasData).toBe(true);
    expect(typeof result.rawText).toBe('string');
  });

  test('defaults channel to workflow when not specified', async () => {
    const runtime = new ToolRuntime();
    const result = await executeToolViaRuntime(
      '__nonexistent__', {}, runtime,
      { sessionId: 's1', phone: '138' },
    );
    // Should not throw, channel defaults to 'workflow'
    expect(result.success).toBe(false);
  });
});
