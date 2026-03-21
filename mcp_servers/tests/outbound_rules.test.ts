/**
 * outbound_rules.test.ts — 外呼服务业务规则测试
 * 测试 PTP 校验、静默时段、结果分类等领域规则
 */
import { describe, test, expect } from 'bun:test';

// 直接测试规则函数（从 outbound_service 中提取的纯逻辑）
// 由于 MCP service 文件依赖 DB，这里测试的是规则本身，不是 MCP 端点

const MAX_PTP_DAYS = 7;

function validatePtpDate(ptpDate: string): { valid: boolean; error?: string } {
  const days = Math.ceil((new Date(ptpDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days > MAX_PTP_DAYS) return { valid: false, error: `ptp_date_exceeds_limit: ${days} days` };
  if (days < 0) return { valid: false, error: 'ptp_date_in_past' };
  return { valid: true };
}

type ResultCategory = 'positive' | 'negative' | 'neutral';
function categorizeCallResult(result: string): ResultCategory {
  if (['ptp', 'converted', 'callback'].includes(result)) return 'positive';
  if (['refusal', 'non_owner', 'verify_failed', 'dnd'].includes(result)) return 'negative';
  return 'neutral';
}

type ConversionTag = 'converted' | 'warm_lead' | 'cold' | 'lost' | 'dnd';
function tagConversion(result: string): ConversionTag {
  switch (result) {
    case 'converted': return 'converted';
    case 'callback': return 'warm_lead';
    case 'not_interested': return 'cold';
    case 'dnd': return 'dnd';
    case 'wrong_number': return 'lost';
    default: return 'cold';
  }
}

function isQuietHours(hour: number): boolean {
  return hour >= 21 || hour < 8;
}

// ── PTP 日期校验 ─────────────────────────────────────────────────────────────

describe('PTP 日期校验', () => {
  test('明天的日期有效', () => {
    const tomorrow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    expect(validatePtpDate(tomorrow).valid).toBe(true);
  });

  test('7天内有效', () => {
    const d = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    expect(validatePtpDate(d).valid).toBe(true);
  });

  test('超过7天被拒绝', () => {
    const d = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const result = validatePtpDate(d);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('ptp_date_exceeds_limit');
  });

  test('过去的日期被拒绝', () => {
    const result = validatePtpDate('2020-01-01');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('ptp_date_in_past');
  });
});

// ── 结果分类 ─────────────────────────────────────────────────────────────────

describe('催收结果分类', () => {
  test('ptp/converted/callback 是 positive', () => {
    expect(categorizeCallResult('ptp')).toBe('positive');
    expect(categorizeCallResult('converted')).toBe('positive');
    expect(categorizeCallResult('callback')).toBe('positive');
  });

  test('refusal/non_owner/verify_failed/dnd 是 negative', () => {
    expect(categorizeCallResult('refusal')).toBe('negative');
    expect(categorizeCallResult('non_owner')).toBe('negative');
    expect(categorizeCallResult('verify_failed')).toBe('negative');
    expect(categorizeCallResult('dnd')).toBe('negative');
  });

  test('no_answer/busy/power_off 是 neutral', () => {
    expect(categorizeCallResult('no_answer')).toBe('neutral');
    expect(categorizeCallResult('busy')).toBe('neutral');
    expect(categorizeCallResult('power_off')).toBe('neutral');
  });
});

// ── 营销转化标签 ─────────────────────────────────────────────────────────────

describe('营销转化标签', () => {
  test('converted → converted', () => expect(tagConversion('converted')).toBe('converted'));
  test('callback → warm_lead', () => expect(tagConversion('callback')).toBe('warm_lead'));
  test('not_interested → cold', () => expect(tagConversion('not_interested')).toBe('cold'));
  test('dnd → dnd', () => expect(tagConversion('dnd')).toBe('dnd'));
  test('wrong_number → lost', () => expect(tagConversion('wrong_number')).toBe('lost'));
  test('no_answer → cold (default)', () => expect(tagConversion('no_answer')).toBe('cold'));
});

// ── 静默时段 ─────────────────────────────────────────────────────────────────

describe('静默时段校验', () => {
  test('21:00 是静默时段', () => expect(isQuietHours(21)).toBe(true));
  test('23:00 是静默时段', () => expect(isQuietHours(23)).toBe(true));
  test('3:00 是静默时段', () => expect(isQuietHours(3)).toBe(true));
  test('7:59 是静默时段', () => expect(isQuietHours(7)).toBe(true));
  test('8:00 不是静默时段', () => expect(isQuietHours(8)).toBe(false));
  test('14:00 不是静默时段', () => expect(isQuietHours(14)).toBe(false));
  test('20:59 不是静默时段', () => expect(isQuietHours(20)).toBe(false));
});
