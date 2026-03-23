// tests/unittest/backend/services/query-normalizer/telecom-lexicon.test.ts
import { describe, test, expect, beforeAll } from 'bun:test';
import { resolve } from 'path';
import { loadLexicons, matchLexicon } from '../../../../src/services/query-normalizer/telecom-lexicon';

beforeAll(() => {
  loadLexicons(resolve(import.meta.dir, '../../../../../backend/src/services/query-normalizer/dictionaries'));
});

describe('matchLexicon', () => {
  test('"乱扣费" → unexpected_charge + bill_dispute intent', () => {
    const r = matchLexicon('乱扣费');
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].entry.term).toBe('unexpected_charge');
    expect(r.intent_hints).toContain('bill_dispute');
  });

  test('"视频包" → value_added_service.video', () => {
    const r = matchLexicon('帮我看看视频包');
    const terms = r.matches.map(m => m.entry.term);
    expect(terms).toContain('value_added_service.video');
  });

  test('long pattern wins: "收不到验证码" over "验证码"', () => {
    const r = matchLexicon('收不到验证码');
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].entry.term).toBe('otp_delivery_issue');
  });

  test('multi-match: "没网还打不了电话"', () => {
    const r = matchLexicon('没网还打不了电话');
    const terms = r.matches.map(m => m.entry.term);
    expect(terms).toContain('data_service_issue');
    expect(terms).toContain('voice_service_issue');
  });

  test('multi-match: "退订视频包"', () => {
    const r = matchLexicon('退订视频包');
    const terms = r.matches.map(m => m.entry.term);
    expect(terms).toContain('cancel_service');
    expect(terms).toContain('value_added_service.video');
  });

  test('"销户" not swallowed by "退订"', () => {
    const r = matchLexicon('我要销户');
    expect(r.matches[0].entry.term).toBe('close_account');
  });

  test('no match → empty', () => {
    const r = matchLexicon('你好');
    expect(r.matches).toHaveLength(0);
    expect(r.intent_hints).toHaveLength(0);
  });

  test('slots populated correctly', () => {
    const r = matchLexicon('转人工');
    expect(r.slots.action_type).toBe('handoff_to_human');
  });

  test('"不要再打了" → do_not_call intent', () => {
    const r = matchLexicon('不要再打了');
    expect(r.matches[0].entry.term).toBe('do_not_call');
    expect(r.intent_hints).toContain('do_not_call');
  });
});
