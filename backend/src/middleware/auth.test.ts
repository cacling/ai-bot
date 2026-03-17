/**
 * auth.test.ts — RBAC 权限中间件测试
 *
 * 测试角色层级判断逻辑（不依赖 HTTP server）。
 */

import { describe, test, expect } from 'bun:test';

// 直接测试角色层级逻辑（与 auth.ts 中一致）
const ROLE_LEVEL: Record<string, number> = {
  auditor: 1,
  reviewer: 2,
  config_editor: 3,
  flow_manager: 4,
  admin: 5,
};

function hasPermission(userRole: string, requiredRole: string): boolean {
  const userLevel = ROLE_LEVEL[userRole] ?? 0;
  const requiredLevel = ROLE_LEVEL[requiredRole] ?? 0;
  return userLevel >= requiredLevel;
}

describe('RBAC 角色层级', () => {
  test('admin 拥有所有权限', () => {
    expect(hasPermission('admin', 'admin')).toBe(true);
    expect(hasPermission('admin', 'flow_manager')).toBe(true);
    expect(hasPermission('admin', 'config_editor')).toBe(true);
    expect(hasPermission('admin', 'reviewer')).toBe(true);
    expect(hasPermission('admin', 'auditor')).toBe(true);
  });

  test('flow_manager 可以做 config_editor 的事', () => {
    expect(hasPermission('flow_manager', 'config_editor')).toBe(true);
    expect(hasPermission('flow_manager', 'reviewer')).toBe(true);
  });

  test('flow_manager 不能做 admin 的事', () => {
    expect(hasPermission('flow_manager', 'admin')).toBe(false);
  });

  test('config_editor 不能回滚', () => {
    expect(hasPermission('config_editor', 'flow_manager')).toBe(false);
  });

  test('auditor 只有最低权限', () => {
    expect(hasPermission('auditor', 'auditor')).toBe(true);
    expect(hasPermission('auditor', 'reviewer')).toBe(false);
    expect(hasPermission('auditor', 'config_editor')).toBe(false);
  });

  test('未知角色无权限', () => {
    expect(hasPermission('unknown_role', 'auditor')).toBe(false);
  });

  test('同级角色有权限', () => {
    expect(hasPermission('config_editor', 'config_editor')).toBe(true);
    expect(hasPermission('reviewer', 'reviewer')).toBe(true);
  });
});

describe('角色层级完整性', () => {
  test('所有 5 个角色都已定义', () => {
    expect(Object.keys(ROLE_LEVEL)).toHaveLength(5);
    expect(ROLE_LEVEL).toHaveProperty('admin');
    expect(ROLE_LEVEL).toHaveProperty('flow_manager');
    expect(ROLE_LEVEL).toHaveProperty('config_editor');
    expect(ROLE_LEVEL).toHaveProperty('reviewer');
    expect(ROLE_LEVEL).toHaveProperty('auditor');
  });

  test('层级严格递增', () => {
    expect(ROLE_LEVEL.auditor).toBeLessThan(ROLE_LEVEL.reviewer);
    expect(ROLE_LEVEL.reviewer).toBeLessThan(ROLE_LEVEL.config_editor);
    expect(ROLE_LEVEL.config_editor).toBeLessThan(ROLE_LEVEL.flow_manager);
    expect(ROLE_LEVEL.flow_manager).toBeLessThan(ROLE_LEVEL.admin);
  });
});
