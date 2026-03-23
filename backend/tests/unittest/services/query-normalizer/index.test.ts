// tests/unittest/backend/services/query-normalizer/index.test.ts
import { describe, test, expect, beforeAll } from 'bun:test';
import { resolve } from 'path';
import { normalizeQuery, loadLexicons } from '../../../../src/services/query-normalizer';
import { formatNormalizedContext } from '../../../../src/services/query-normalizer';

const NOW = new Date('2026-03-22T10:00:00+08:00');
const ctx = { currentDate: NOW };

beforeAll(() => {
  loadLexicons(resolve(import.meta.dir, '../../../../../backend/src/services/query-normalizer/dictionaries'));
});

describe('normalizeQuery — full pipeline', () => {
  test('"查下上个月话费" → high confidence, rules only', async () => {
    const r = await normalizeQuery('查下上个月话费', ctx);
    expect(r.original_query).toBe('查下上个月话费');
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
    expect(r.source).toBe('rules');
    expect(r.normalized_slots.time?.value).toBe('2026-02');
    expect(r.normalized_slots.time?.source).toBe('relative');
    expect(r.latency_ms).toBeLessThan(100);
  });

  test('"帮我退订视频包" → video + cancel', async () => {
    const r = await normalizeQuery('帮我退订视频包', ctx);
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
    expect(r.normalized_slots.service_subtype).toBe('value_added_service.video');
    expect(r.normalized_slots.action_type).toBe('cancel_service');
  });

  test('"今天突然没网了还打不了电话" → dual network issues', async () => {
    const r = await normalizeQuery('今天突然没网了还打不了电话', ctx);
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
    expect(r.normalized_slots.network_issue_type).toBeDefined();
  });

  test('"我上个月那个视频包是不是乱扣了" → time + video + charge', async () => {
    const r = await normalizeQuery('我上个月那个视频包是不是乱扣了', ctx);
    expect(r.normalized_slots.time?.value).toBe('2026-02');
    expect(r.intent_hints).toContain('bill_dispute');
  });

  test('"查话费顺便退订视频包" → multi-intent', async () => {
    const r = await normalizeQuery('查话费顺便退订视频包', ctx);
    expect(r.intent_hints.length).toBeGreaterThanOrEqual(1);
    expect(r.normalized_slots.action_type).toBe('cancel_service');
  });

  test('empty string → confidence 0', async () => {
    const r = await normalizeQuery('', ctx);
    expect(r.confidence).toBe(0);
    expect(r.source).toBe('rules');
    expect(r.rewritten_query).toBe('');
  });

  test('rewrite does not contain English terms', async () => {
    const r = await normalizeQuery('帮我退了视频包', ctx);
    expect(r.rewritten_query).not.toContain('cancel_service');
    expect(r.rewritten_query).not.toContain('value_added_service');
  });

  test('phone number extracted to msisdn slot', async () => {
    const r = await normalizeQuery('帮13800138000查话费', ctx);
    expect(r.normalized_slots.msisdn).toBe('13800138000');
  });
});

describe('formatNormalizedContext', () => {
  test('output contains section header', async () => {
    const r = await normalizeQuery('查下上个月话费', ctx);
    const formatted = formatNormalizedContext(r);
    expect(formatted).toContain('用户输入分析');
  });

  test('output contains time info', async () => {
    const r = await normalizeQuery('查下上个月话费', ctx);
    const formatted = formatNormalizedContext(r);
    expect(formatted).toContain('2026-02');
    expect(formatted).toContain('时间');
  });

  test('output contains confidence', async () => {
    const r = await normalizeQuery('查话费', ctx);
    const formatted = formatNormalizedContext(r);
    expect(formatted).toContain('置信度');
    expect(formatted).toContain('来源');
  });

  test('ambiguities formatted when present', async () => {
    const r = await normalizeQuery('我要停机', ctx);
    const formatted = formatNormalizedContext(r);
    if (r.ambiguities.length > 0) {
      expect(formatted).toContain('歧义提醒');
    }
  });
});
