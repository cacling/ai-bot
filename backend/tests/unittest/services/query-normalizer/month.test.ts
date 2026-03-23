/**
 * month.test.ts — Tests for normalizeMonthParam
 */
import { describe, test, expect } from 'bun:test';
import { normalizeMonthParam } from '../../../../src/services/query-normalizer/month';

const CURRENT_YEAR = new Date().getFullYear();

describe('normalizeMonthParam', () => {
  // Line 16: already standard "YYYY-MM"
  test('returns standard YYYY-MM as-is', () => {
    expect(normalizeMonthParam('2026-02')).toBe('2026-02');
    expect(normalizeMonthParam('2025-12')).toBe('2025-12');
  });

  test('trims whitespace before matching', () => {
    expect(normalizeMonthParam('  2026-02  ')).toBe('2026-02');
  });

  // Line 18-19: "YYYY-M" → pad to "YYYY-MM"
  test('pads single-digit month after dash', () => {
    expect(normalizeMonthParam('2026-2')).toBe('2026-02');
    expect(normalizeMonthParam('2026-9')).toBe('2026-09');
  });

  test('handles two-digit month with YYYY-MM via dash branch', () => {
    // "2026-12" matches the first regex (already standard), not the dash branch
    expect(normalizeMonthParam('2026-12')).toBe('2026-12');
  });

  // Line 21-22: "2026年2月" / "2026年02月"
  test('parses Chinese full format "YYYY年M月"', () => {
    expect(normalizeMonthParam('2026年2月')).toBe('2026-02');
    expect(normalizeMonthParam('2026年02月')).toBe('2026-02');
    expect(normalizeMonthParam('2026年12月')).toBe('2026-12');
  });

  test('parses Chinese full format with spaces', () => {
    expect(normalizeMonthParam('2026 年 2 月')).toBe('2026-02');
  });

  test('parses Chinese full format without trailing 月', () => {
    // The regex has 月? so "2026年2" should also match
    expect(normalizeMonthParam('2026年2')).toBe('2026-02');
  });

  // Lines 24-26: Chinese number months "二月" / "十二月" / "二月份"
  test('parses Chinese number month "二月"', () => {
    expect(normalizeMonthParam('二月')).toBe(`${CURRENT_YEAR}-02`);
  });

  test('parses Chinese number month "十二月"', () => {
    expect(normalizeMonthParam('十二月')).toBe(`${CURRENT_YEAR}-12`);
  });

  test('parses Chinese number month "一月份"', () => {
    expect(normalizeMonthParam('一月份')).toBe(`${CURRENT_YEAR}-01`);
  });

  test('parses all Chinese number months', () => {
    const expected: Record<string, string> = {
      '一月': '01', '二月': '02', '三月': '03', '四月': '04',
      '五月': '05', '六月': '06', '七月': '07', '八月': '08',
      '九月': '09', '十月': '10', '十一月': '11', '十二月': '12',
    };
    for (const [cn, mm] of Object.entries(expected)) {
      expect(normalizeMonthParam(cn)).toBe(`${CURRENT_YEAR}-${mm}`);
    }
  });

  // Lines 28-32: bare month number "2月" / "02" / "2" / "2月份"
  test('parses bare month number "2月"', () => {
    expect(normalizeMonthParam('2月')).toBe(`${CURRENT_YEAR}-02`);
  });

  test('parses bare month number "02"', () => {
    expect(normalizeMonthParam('02')).toBe(`${CURRENT_YEAR}-02`);
  });

  test('parses bare single digit "2"', () => {
    expect(normalizeMonthParam('2')).toBe(`${CURRENT_YEAR}-02`);
  });

  test('parses bare month with 份 suffix "2月份"', () => {
    expect(normalizeMonthParam('2月份')).toBe(`${CURRENT_YEAR}-02`);
  });

  test('parses bare month 12', () => {
    expect(normalizeMonthParam('12')).toBe(`${CURRENT_YEAR}-12`);
    expect(normalizeMonthParam('12月')).toBe(`${CURRENT_YEAR}-12`);
  });

  test('rejects bare month out of range (0, 13)', () => {
    // m < 1 or m > 12 falls through to return as-is
    expect(normalizeMonthParam('0')).toBe('0');
    expect(normalizeMonthParam('13')).toBe('13');
    expect(normalizeMonthParam('0月')).toBe('0月');
  });

  // Line 34: unrecognized — return as-is
  test('returns unrecognized input as-is', () => {
    expect(normalizeMonthParam('hello')).toBe('hello');
    expect(normalizeMonthParam('last month')).toBe('last month');
    expect(normalizeMonthParam('')).toBe('');
  });
});
