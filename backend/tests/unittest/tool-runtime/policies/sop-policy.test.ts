import { describe, test, expect } from 'bun:test';
import { SopPolicy } from '../../../../src/tool-runtime/policies/sop-policy';
import { SOPGuard } from '../../../../src/engine/sop-guard';
import type { ToolRuntimeRequest, ToolContract, ResolvedTool } from '../../../../src/tool-runtime/types';

describe('SopPolicy', () => {
  test('returns null when no guard is set', () => {
    const policy = new SopPolicy();
    const req: ToolRuntimeRequest = { toolName: 'test', args: {}, channel: 'online', sessionId: 's1' };
    const resolved: ResolvedTool = {
      contract: { id: '1', name: 'test', description: '', mocked: false, disabled: false } as ToolContract,
      binding: null,
      connector: null,
    };
    expect(policy.check(req, resolved)).toBeNull();
  });

  test('delegates to SOPGuard.check()', () => {
    const guard = new SOPGuard();
    const policy = new SopPolicy(guard);
    const req: ToolRuntimeRequest = { toolName: 'test', args: {}, channel: 'online', sessionId: 's1' };
    const resolved: ResolvedTool = {
      contract: { id: '1', name: 'test', description: '', mocked: false, disabled: false } as ToolContract,
      binding: null,
      connector: null,
    };
    // Without a plan, guard should pass everything
    expect(policy.check(req, resolved)).toBeNull();
  });
});
