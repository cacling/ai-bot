import type { Adapter, AdapterCallContext, AdapterType } from '../types';
import { matchMockRule } from '../../services/mock-engine';
import { isErrorResult, isNoDataResult } from '../../services/tool-result';
import { logger } from '../../services/logger';

export class MockAdapter implements Adapter {
  type: AdapterType = 'mock';

  async call(ctx: AdapterCallContext): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    const { toolName, args } = ctx.request;

    // Delegate to mock-engine.ts which handles:
    // - Tool-level mock rules (from mcp_tools table)
    // - Server-level mock rules (from mcp_servers table, fallback)
    // - Expression matching
    // - Wildcard matching
    const mockResult = matchMockRule(toolName, args as Record<string, unknown>);

    if (mockResult !== null) {
      logger.info('mock-adapter', 'matched', { tool: toolName, trace: ctx.traceId });
      const success = !isErrorResult(mockResult);
      const hasData = success && !isNoDataResult(mockResult);
      let parsed: unknown;
      try { parsed = JSON.parse(mockResult); } catch { parsed = mockResult; }
      return { rawText: mockResult, parsed, success, hasData };
    }

    return {
      rawText: JSON.stringify({ success: false, message: `Tool ${toolName} is mocked but no mock rules matched` }),
      parsed: { success: false },
      success: false,
      hasData: false,
    };
  }
}
