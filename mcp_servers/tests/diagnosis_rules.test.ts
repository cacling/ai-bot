/**
 * diagnosis_rules.test.ts — 诊断服务业务规则测试
 * 测试 severity 分级、升级判断等领域规则
 */
import { describe, test, expect } from 'bun:test';

type Severity = 'critical' | 'warning' | 'normal';

interface Step { status: 'ok' | 'warning' | 'error'; escalate?: boolean }

function classifySeverity(steps: Step[]): Severity {
  const hasError = steps.some(s => s.status === 'error');
  const hasWarning = steps.some(s => s.status === 'warning');
  return hasError ? 'critical' : hasWarning ? 'warning' : 'normal';
}

function shouldEscalate(steps: Step[]): boolean {
  return steps.filter(s => s.status === 'error').length >= 2;
}

type RiskLevel = 'high' | 'medium' | 'low' | 'none';

function classifyRiskLevel(steps: Step[]): RiskLevel {
  const hasError = steps.some(s => s.status === 'error');
  const hasEscalate = steps.some(s => s.escalate);
  if (hasEscalate && hasError) return 'high';
  if (hasEscalate) return 'medium';
  if (hasError) return 'low';
  return 'none';
}

// ── 网络诊断 severity ────────────────────────────────────────────────────────

describe('网络诊断 severity 分级', () => {
  test('全部 ok → normal', () => {
    expect(classifySeverity([{ status: 'ok' }, { status: 'ok' }])).toBe('normal');
  });

  test('有 warning → warning', () => {
    expect(classifySeverity([{ status: 'ok' }, { status: 'warning' }])).toBe('warning');
  });

  test('有 error → critical', () => {
    expect(classifySeverity([{ status: 'ok' }, { status: 'error' }])).toBe('critical');
  });

  test('error 优先于 warning', () => {
    expect(classifySeverity([{ status: 'warning' }, { status: 'error' }])).toBe('critical');
  });
});

// ── 升级判断 ─────────────────────────────────────────────────────────────────

describe('shouldEscalate', () => {
  test('1 个 error 不升级', () => {
    expect(shouldEscalate([{ status: 'error' }, { status: 'ok' }])).toBe(false);
  });

  test('2 个 error 升级', () => {
    expect(shouldEscalate([{ status: 'error' }, { status: 'error' }])).toBe(true);
  });

  test('无 error 不升级', () => {
    expect(shouldEscalate([{ status: 'warning' }, { status: 'ok' }])).toBe(false);
  });
});

// ── App 诊断 risk_level ──────────────────────────────────────────────────────

describe('App 诊断 risk_level', () => {
  test('escalate + error → high', () => {
    expect(classifyRiskLevel([{ status: 'error', escalate: true }])).toBe('high');
  });

  test('escalate + warning → medium', () => {
    expect(classifyRiskLevel([{ status: 'warning', escalate: true }])).toBe('medium');
  });

  test('error 无 escalate → low', () => {
    expect(classifyRiskLevel([{ status: 'error' }])).toBe('low');
  });

  test('全部 ok → none', () => {
    expect(classifyRiskLevel([{ status: 'ok' }])).toBe('none');
  });
});
