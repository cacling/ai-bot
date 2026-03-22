// tests/unittest/backend/services/query-normalizer/preprocess.test.ts
import { describe, test, expect } from 'bun:test';
import { preprocess } from '../../../../../backend/src/services/query-normalizer/preprocess';

describe('preprocess', () => {
  test('converts fullwidth digits to halfwidth', () => {
    const r = preprocess('１３８００１３８０００');
    expect(r.cleaned).toBe('13800138000');
  });

  test('collapses multiple spaces', () => {
    const r = preprocess('查下   上个月  话费');
    expect(r.cleaned).toBe('查下 上个月 话费');
  });

  test('trims whitespace', () => {
    const r = preprocess('  查话费  ');
    expect(r.cleaned).toBe('查话费');
  });

  test('extracts phone number', () => {
    const r = preprocess('我号码是13800138000');
    expect(r.identifiers).toHaveLength(1);
    expect(r.identifiers[0].type).toBe('msisdn');
    expect(r.identifiers[0].value).toBe('13800138000');
  });

  test('extracts phone number with spaces', () => {
    const r = preprocess('号码 13900139000 查话费');
    expect(r.identifiers[0].value).toBe('13900139000');
  });

  test('empty string returns empty result', () => {
    const r = preprocess('');
    expect(r.cleaned).toBe('');
    expect(r.identifiers).toHaveLength(0);
  });

  test('fullwidth letters converted', () => {
    const r = preprocess('Ａｐｐ闪退');
    expect(r.cleaned).toBe('App闪退');
  });
});
