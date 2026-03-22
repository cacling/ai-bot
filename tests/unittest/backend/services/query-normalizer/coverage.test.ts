// tests/unittest/backend/services/query-normalizer/coverage.test.ts
import { describe, test, expect, beforeAll } from 'bun:test';
import { resolve } from 'path';
import { evaluateCoverage } from '../../../../../backend/src/services/query-normalizer/coverage';
import { detectAmbiguities } from '../../../../../backend/src/services/query-normalizer/ambiguity-detector';
import { resolveTime } from '../../../../../backend/src/services/query-normalizer/time-resolver';
import { loadLexicons, matchLexicon } from '../../../../../backend/src/services/query-normalizer/telecom-lexicon';

const NOW = new Date('2026-03-22T10:00:00+08:00');

beforeAll(() => {
  loadLexicons(resolve(import.meta.dir, '../../../../../backend/src/services/query-normalizer/dictionaries'));
});

describe('evaluateCoverage', () => {
  test('"查下上个月话费" → high confidence', () => {
    const time = resolveTime('查下上个月话费', NOW);
    const lex = matchLexicon(time.normalized_text);
    const r = evaluateCoverage('查下上个月话费', time.matches, lex.matches, []);
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
    expect(r.should_fallback_llm).toBe(false);
  });

  test('"我那个啥包好像多扣了" → low confidence', () => {
    const time = resolveTime('我那个啥包好像多扣了', NOW);
    const lex = matchLexicon(time.normalized_text);
    const r = evaluateCoverage('我那个啥包好像多扣了', time.matches, lex.matches, []);
    expect(r.confidence).toBeLessThan(0.7);
    expect(r.should_fallback_llm).toBe(true);
  });

  test('empty string → confidence 0', () => {
    const r = evaluateCoverage('', [], [], []);
    expect(r.confidence).toBe(0);
    expect(r.should_fallback_llm).toBe(true);
  });
});

describe('detectAmbiguities', () => {
  test('"停机" triggers account_state ambiguity', () => {
    const lex = matchLexicon('我要停机');
    const time = resolveTime('我要停机', NOW);
    const ambigs = detectAmbiguities(lex.matches, time);
    const stateAmbig = ambigs.find(a => a.field === 'account_state');
    expect(stateAmbig).toBeDefined();
    expect(stateAmbig!.candidates).toContain('arrears_suspended');
  });

  test('"没网" triggers network ambiguity', () => {
    const lex = matchLexicon('没网');
    const time = resolveTime('没网', NOW);
    const ambigs = detectAmbiguities(lex.matches, time);
    expect(ambigs.find(a => a.field === 'network_issue_type')).toBeDefined();
  });

  test('"退订" without product → service_subtype ambiguity', () => {
    const lex = matchLexicon('我要退订');
    const time = resolveTime('我要退订', NOW);
    const ambigs = detectAmbiguities(lex.matches, time);
    expect(ambigs.find(a => a.field === 'service_subtype')).toBeDefined();
  });

  test('"退订视频包" → no service_subtype ambiguity', () => {
    const lex = matchLexicon('退订视频包');
    const time = resolveTime('退订视频包', NOW);
    const ambigs = detectAmbiguities(lex.matches, time);
    expect(ambigs.find(a => a.field === 'service_subtype')).toBeUndefined();
  });
});
