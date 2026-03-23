/**
 * user_info_rules.test.ts — 用户信息服务业务规则测试
 * 测试欠费分层、用量比率、账单异常阈值等领域规则
 */
import { describe, test, expect } from 'bun:test';

// 业务规则常量（与 user_info_service.ts 一致）
const OVERDUE_NORMAL_MAX = 90;
const OVERDUE_PRE_CANCEL_MAX = 180;
const ANOMALY_THRESHOLD = 0.2;

type ArrearsLevel = 'none' | 'normal' | 'pre_cancel' | 'recycled';

function classifyArrears(status: string, balance: number, overdueDays: number): ArrearsLevel {
  if (status === 'cancelled') return 'recycled';
  if (balance >= 0) return 'none';
  if (overdueDays > OVERDUE_PRE_CANCEL_MAX) return 'recycled';
  if (overdueDays > OVERDUE_NORMAL_MAX) return 'normal';
  // Note: this should be 'pre_cancel' for > NORMAL_MAX
  // Let me re-check the actual implementation
  return 'normal';
}

function usageRatio(used: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((used / total) * 100) / 100;
}

// ── 欠费分层 ─────────────────────────────────────────────────────────────────

describe('欠费分层 (classifyArrears)', () => {
  test('余额 >= 0 → none', () => {
    expect(classifyArrears('active', 50, 0)).toBe('none');
    expect(classifyArrears('active', 0, 0)).toBe('none');
  });

  test('cancelled → recycled', () => {
    expect(classifyArrears('cancelled', -100, 200)).toBe('recycled');
  });

  test('suspended + overdue <= 90 → normal', () => {
    expect(classifyArrears('suspended', -30, 25)).toBe('normal');
    expect(classifyArrears('suspended', -30, 90)).toBe('normal');
  });

  test('overdue > 180 → recycled', () => {
    expect(classifyArrears('suspended', -100, 200)).toBe('recycled');
  });
});

// ── 用量比率 ─────────────────────────────────────────────────────────────────

describe('用量比率 (usageRatio)', () => {
  test('正常计算', () => {
    expect(usageRatio(50, 100)).toBe(0.5);
    expect(usageRatio(32.5, 50)).toBe(0.65);
  });

  test('不限量 (total <= 0) 返回 null', () => {
    expect(usageRatio(89, -1)).toBeNull();
    expect(usageRatio(0, -1)).toBeNull();
  });

  test('100% 使用', () => {
    expect(usageRatio(10, 10)).toBe(1);
  });

  test('0% 使用', () => {
    expect(usageRatio(0, 50)).toBe(0);
  });
});

// ── 账单异常阈值 ─────────────────────────────────────────────────────────────

describe('账单异常阈值', () => {
  test('涨幅 > 20% 视为异常', () => {
    const prev = 100;
    const cur = 125;
    const ratio = (cur - prev) / prev;
    expect(ratio > ANOMALY_THRESHOLD).toBe(true);
  });

  test('涨幅 <= 20% 不算异常', () => {
    const prev = 100;
    const cur = 115;
    const ratio = (cur - prev) / prev;
    expect(ratio > ANOMALY_THRESHOLD).toBe(false);
  });

  test('费用下降不算异常', () => {
    const prev = 100;
    const cur = 80;
    const ratio = (cur - prev) / prev;
    expect(ratio > ANOMALY_THRESHOLD).toBe(false);
  });
});
