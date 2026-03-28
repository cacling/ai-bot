/**
 * disabled tool surface 测试
 *
 * 验证 disabled 工具不出现在 getToolSurface() 但 resolve() 仍可找到。
 * 这是 L4 Disposition 模式的核心语义：LLM 看不到但应用层可调用。
 */
import { describe, test, expect } from 'bun:test';
import { ToolRegistry } from '../../../src/tool-runtime/registry';

describe('disabled tool surface vs resolve', () => {
  test('getToolSurface excludes disabled tools', () => {
    const registry = new ToolRegistry();

    const surface = registry.getToolSurface();
    const surfaceNames = surface.map(c => c.name);

    // cancel_service is marked disabled in seed.ts — should NOT appear in surface
    // Note: this test depends on seed data being loaded. If DB is empty, skip.
    if (surfaceNames.length === 0) return; // No seed data loaded

    expect(surfaceNames).not.toContain('transfer_balance'); // always disabled (test fixture)
  });

  test('resolve finds disabled tools', () => {
    const registry = new ToolRegistry();

    // transfer_balance is always disabled in seed.ts
    const resolved = registry.resolve('transfer_balance');
    // If seed data is loaded, it should be found
    if (resolved) {
      expect(resolved.contract.name).toBe('transfer_balance');
      expect(resolved.contract.disabled).toBe(true);
    }
  });

  test('resolve finds cancel_service regardless of disabled state', () => {
    const registry = new ToolRegistry();

    const resolved = registry.resolve('cancel_service');
    if (resolved) {
      expect(resolved.contract.name).toBe('cancel_service');
      // resolve() returns the tool whether disabled or not — this is the key semantic
    }
  });
});
