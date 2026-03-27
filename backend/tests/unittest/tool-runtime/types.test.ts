import { describe, test, expect } from 'bun:test';
import type { ToolRuntimeRequest, ToolRuntimeResult, ToolContract, ToolBinding, Adapter } from '../../../src/tool-runtime/types';
import { ErrorCode, isRetryable, makeErrorResult, makeSuccessResult } from '../../../src/tool-runtime/types';

describe('Tool Runtime Types', () => {
  test('ErrorCode enum has expected values', () => {
    expect(ErrorCode.TOOL_NOT_FOUND).toBe('TOOL_NOT_FOUND');
    expect(ErrorCode.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
    expect(ErrorCode.ADAPTER_ERROR).toBe('ADAPTER_ERROR');
    expect(ErrorCode.TIMEOUT).toBe('TIMEOUT');
    expect(ErrorCode.POLICY_REJECTED).toBe('POLICY_REJECTED');
    expect(ErrorCode.NO_DATA).toBe('NO_DATA');
  });

  test('isRetryable classifies error codes', () => {
    expect(isRetryable(ErrorCode.TIMEOUT)).toBe(true);
    expect(isRetryable(ErrorCode.ADAPTER_ERROR)).toBe(true);
    expect(isRetryable(ErrorCode.VALIDATION_FAILED)).toBe(false);
    expect(isRetryable(ErrorCode.POLICY_REJECTED)).toBe(false);
  });

  test('makeSuccessResult builds correct shape', () => {
    const r = makeSuccessResult({
      rawText: '{"ok":true}',
      parsed: { ok: true },
      source: 'remote_mcp',
      latencyMs: 100,
      traceId: 'trc_1',
    });
    expect(r.success).toBe(true);
    expect(r.hasData).toBe(true);
    expect(r.source).toBe('remote_mcp');
  });

  test('makeErrorResult builds correct shape', () => {
    const r = makeErrorResult({
      errorCode: ErrorCode.TIMEOUT,
      rawText: 'timeout after 5000ms',
      source: 'remote_mcp',
      latencyMs: 5001,
      traceId: 'trc_2',
    });
    expect(r.success).toBe(false);
    expect(r.hasData).toBe(false);
    expect(r.errorCode).toBe('TIMEOUT');
  });
});
