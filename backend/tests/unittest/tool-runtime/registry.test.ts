import { describe, test, expect, beforeEach } from 'bun:test';
import { ToolRegistry } from '../../../src/tool-runtime/registry';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.refresh();
  });

  test('resolves a known tool from mcp_tools table', () => {
    const resolved = registry.resolve('query_subscriber');
    expect(resolved).not.toBeNull();
    expect(resolved!.contract.name).toBe('query_subscriber');
  });

  test('returns null for unknown tool', () => {
    const resolved = registry.resolve('__nonexistent_tool_xyz__');
    expect(resolved).toBeNull();
  });

  test('lists all contracts', () => {
    const all = registry.listContracts();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
  });

  test('filters disabled tools from surface', () => {
    const surface = registry.getToolSurface();
    for (const tool of surface) {
      expect(tool.disabled).toBe(false);
    }
  });

  test('refresh clears cache and reloads', () => {
    const before = registry.listContracts().length;
    registry.refresh();
    const after = registry.listContracts().length;
    expect(after).toBe(before);
  });

  test('resolves binding and connector when tool_implementations row exists', () => {
    const all = registry.listContracts();
    if (all.length > 0) {
      const resolved = registry.resolve(all[0].name);
      expect(resolved).not.toBeNull();
    }
  });
});
