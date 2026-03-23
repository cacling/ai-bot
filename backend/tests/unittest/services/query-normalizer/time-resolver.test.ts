// tests/unittest/backend/services/query-normalizer/time-resolver.test.ts
import { describe, test, expect } from 'bun:test';
import { resolveTime } from '../../../../src/services/query-normalizer/time-resolver';

const NOW = new Date('2026-03-22T10:00:00+08:00');

describe('resolveTime', () => {
  test('explicit year-month: "2026年2月"', () => {
    const r = resolveTime('查2026年2月账单', NOW);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].slot).toEqual({ kind: 'natural_month', value: '2026-02', source: 'explicit' });
  });

  test('explicit full date: "2026年2月15日"', () => {
    const r = resolveTime('2026年2月15日发生的', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'specific_date', value: '2026-02-15', source: 'explicit' });
  });

  test('explicit date with dash: "2026-02"', () => {
    const r = resolveTime('查2026-02账单', NOW);
    expect(r.matches[0].slot.value).toBe('2026-02');
  });

  test('relative: "上个月" → 2026-02', () => {
    const r = resolveTime('查下上个月话费', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'natural_month', value: '2026-02', source: 'relative' });
  });

  test('relative: "本月" → 2026-03', () => {
    const r = resolveTime('本月账单', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'natural_month', value: '2026-03', source: 'relative' });
  });

  test('relative: "下个月" → 2026-04', () => {
    const r = resolveTime('下个月生效', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'natural_month', value: '2026-04', source: 'relative' });
  });

  test('cross-year: "上个月" when now=2026-01', () => {
    const jan = new Date('2026-01-15T10:00:00+08:00');
    const r = resolveTime('上个月', jan);
    expect(r.matches[0].slot.value).toBe('2025-12');
  });

  test('"去年12月" → 2025-12', () => {
    const r = resolveTime('去年12月的账单', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'natural_month', value: '2025-12', source: 'relative' });
  });

  test('"最近三个月" → date_range', () => {
    const r = resolveTime('最近三个月流量', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'date_range', value: '2026-01~2026-03', source: 'relative' });
  });

  test('"最近两个月" → date_range', () => {
    const r = resolveTime('最近两个月', NOW);
    expect(r.matches[0].slot.value).toBe('2026-02~2026-03');
  });

  test('"本期" → billing_period current', () => {
    const r = resolveTime('本期账单', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'billing_period', value: 'current', source: 'relative' });
  });

  test('"上期" → billing_period previous', () => {
    const r = resolveTime('上期账单', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'billing_period', value: 'previous', source: 'relative' });
  });

  test('"上账期" → billing_period previous', () => {
    const r = resolveTime('上账期', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'billing_period', value: 'previous', source: 'relative' });
  });

  test('"最近话费" → ambiguity', () => {
    const r = resolveTime('最近话费不对', NOW);
    expect(r.matches).toHaveLength(0);
    expect(r.ambiguities).toHaveLength(1);
    expect(r.ambiguities[0].field).toBe('time');
  });

  test('no time words → empty matches', () => {
    const r = resolveTime('查话费', NOW);
    expect(r.matches).toHaveLength(0);
    expect(r.ambiguities).toHaveLength(0);
  });

  test('mixed: "本期账单和上个月的"', () => {
    const r = resolveTime('本期账单和上个月的', NOW);
    expect(r.matches).toHaveLength(2);
    const kinds = r.matches.map(m => m.slot.kind);
    expect(kinds).toContain('billing_period');
    expect(kinds).toContain('natural_month');
  });

  test('normalized_text replaces relative time', () => {
    const r = resolveTime('查下上个月话费', NOW);
    expect(r.normalized_text).toContain('2026年2月');
    expect(r.normalized_text).not.toContain('上个月');
  });

  test('normalized_text keeps explicit time unchanged', () => {
    const r = resolveTime('2026年2月账单', NOW);
    expect(r.normalized_text).toBe('2026年2月账单');
  });

  test('"1月到3月" → date_range', () => {
    const r = resolveTime('1月到3月流量', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'date_range', value: '2026-01~2026-03', source: 'explicit' });
  });
});
