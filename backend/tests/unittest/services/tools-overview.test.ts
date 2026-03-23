/**
 * tools-overview.test.ts — 工具概览聚合 API 测试
 *
 * 使用真实 DB（seed 数据），测试 getToolsOverview() 和 getToolDetail() 的纯逻辑。
 * 不使用 mock.module()。
 */

import { describe, test, expect } from 'bun:test';
import { getToolsOverview, getToolDetail, type ToolOverviewItem, type ToolDetailItem } from '../../../src/agent/km/mcp/tools-overview';

describe('getToolsOverview', () => {
  test('返回非空数组', () => {
    const items = getToolsOverview();
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  test('包含内建工具 get_skill_instructions', () => {
    const items = getToolsOverview();
    const builtin = items.find(i => i.name === 'get_skill_instructions');
    expect(builtin).toBeDefined();
    expect(builtin!.source_type).toBe('builtin');
    expect(builtin!.source).toBe('内建 (skillsTools)');
  });

  test('包含内建工具 transfer_to_human', () => {
    const items = getToolsOverview();
    const builtin = items.find(i => i.name === 'transfer_to_human');
    expect(builtin).toBeDefined();
    expect(builtin!.source_type).toBe('builtin');
  });

  test('包含内建工具 get_skill_reference', () => {
    const items = getToolsOverview();
    const builtin = items.find(i => i.name === 'get_skill_reference');
    expect(builtin).toBeDefined();
    expect(builtin!.source_type).toBe('builtin');
  });

  test('每个 item 包含必需字段', () => {
    const items = getToolsOverview();
    for (const item of items) {
      expect(typeof item.name).toBe('string');
      expect(item.name.length).toBeGreaterThan(0);
      expect(typeof item.description).toBe('string');
      expect(typeof item.source).toBe('string');
      expect(['mcp', 'builtin', 'local']).toContain(item.source_type);
      expect(['available', 'disabled', 'planned']).toContain(item.status);
      expect(typeof item.mocked).toBe('boolean');
      expect(Array.isArray(item.skills)).toBe(true);
    }
  });

  test('内建工具 mocked 为 false', () => {
    const items = getToolsOverview();
    const builtins = items.filter(i => i.source_type === 'builtin');
    for (const b of builtins) {
      expect(b.mocked).toBe(false);
    }
  });

  test('不包含重复的工具名（内建除外 source_type 区分）', () => {
    const items = getToolsOverview();
    const names = items.map(i => i.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});

describe('getToolDetail', () => {
  test('内建工具 get_skill_instructions 返回正确详情', () => {
    const detail = getToolDetail('get_skill_instructions');
    expect(detail).not.toBeNull();
    expect(detail!.name).toBe('get_skill_instructions');
    expect(detail!.source_type).toBe('builtin');
    expect(detail!.status).toBe('available');
    expect(detail!.mocked).toBe(false);
  });

  test('内建工具 transfer_to_human 返回正确详情', () => {
    const detail = getToolDetail('transfer_to_human');
    expect(detail).not.toBeNull();
    expect(detail!.source_type).toBe('builtin');
  });

  test('不存在的工具返回 null', () => {
    const detail = getToolDetail('nonexistent_tool_xyz_99999');
    expect(detail).toBeNull();
  });

  test('详情结果包含 inputSchema 和 responseExample 字段', () => {
    const detail = getToolDetail('get_skill_instructions');
    expect(detail).not.toBeNull();
    expect('inputSchema' in detail!).toBe(true);
    expect('responseExample' in detail!).toBe(true);
  });

  test('详情结果包含 skills 数组', () => {
    const detail = getToolDetail('get_skill_instructions');
    expect(detail).not.toBeNull();
    expect(Array.isArray(detail!.skills)).toBe(true);
  });

  test('MCP 工具（如果存在）source_type 为 mcp', () => {
    const items = getToolsOverview();
    const mcpTool = items.find(i => i.source_type === 'mcp');
    if (mcpTool) {
      const detail = getToolDetail(mcpTool.name);
      expect(detail).not.toBeNull();
      expect(detail!.source_type).toBe('mcp');
    }
  });

  test('MCP 工具详情包含 inputSchema（如果有）', () => {
    const items = getToolsOverview();
    const mcpTool = items.find(i => i.source_type === 'mcp' && i.status === 'available');
    if (mcpTool) {
      const detail = getToolDetail(mcpTool.name);
      expect(detail).not.toBeNull();
      // inputSchema can be null or an object
      expect(detail!.inputSchema === null || typeof detail!.inputSchema === 'object').toBe(true);
      expect(detail!.responseExample === null || detail!.responseExample !== undefined).toBe(true);
    }
  });

  test('skill-referenced but unregistered tool returns planned status', () => {
    // getToolDetail for a tool that only exists in skill refs returns planned
    // We need to find such a tool from getToolsOverview
    const items = getToolsOverview();
    const missingTool = items.find(i => i.source === '(未注册)' && i.status === 'planned');
    if (missingTool) {
      const detail = getToolDetail(missingTool.name);
      expect(detail).not.toBeNull();
      expect(detail!.status).toBe('planned');
      expect(detail!.source).toBe('(未注册)');
      expect(detail!.skills.length).toBeGreaterThan(0);
      expect(detail!.inputSchema).toBeNull();
      expect(detail!.responseExample).toBeNull();
    }
  });
});

describe('getToolsOverview — missing tools', () => {
  test('overview includes tools referenced by skills but not registered', () => {
    const items = getToolsOverview();
    const missingTools = items.filter(i => i.source === '(未注册)');
    // Each missing tool should have planned status and at least one skill reference
    for (const tool of missingTools) {
      expect(tool.status).toBe('planned');
      expect(tool.source_type).toBe('mcp');
      expect(tool.mocked).toBe(false);
      expect(tool.skills.length).toBeGreaterThan(0);
    }
  });

  test('overview has no duplicate tool names', () => {
    const items = getToolsOverview();
    const names = items.map(i => i.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('getToolDetail — fallback paths', () => {
  test('returns null for completely unknown tool', () => {
    const detail = getToolDetail('absolutely_nonexistent_tool_xyz_999');
    expect(detail).toBeNull();
  });

  test('returns builtin tool get_skill_reference with correct fields', () => {
    const detail = getToolDetail('get_skill_reference');
    expect(detail).not.toBeNull();
    expect(detail!.name).toBe('get_skill_reference');
    expect(detail!.source_type).toBe('builtin');
    expect(detail!.status).toBe('available');
    expect(detail!.mocked).toBe(false);
    expect(detail!.inputSchema).toBeNull();
    expect(detail!.responseExample).toBeNull();
  });

  test('MCP tool from mcp_tools table has source from server', () => {
    const items = getToolsOverview();
    const mcpTool = items.find(i => i.source_type === 'mcp' && i.source !== '(未注册)' && i.source !== '(未分配)');
    if (mcpTool) {
      const detail = getToolDetail(mcpTool.name);
      expect(detail).not.toBeNull();
      expect(detail!.source).toBe(mcpTool.source);
      expect(detail!.source_type).toBe('mcp');
    }
  });
});
