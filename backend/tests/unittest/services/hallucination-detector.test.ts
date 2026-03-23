/**
 * hallucination-detector.test.ts — Pure logic branch tests only.
 *
 * LLM-dependent paths are excluded (they require external service).
 * Only the early-return branches (empty input) are tested.
 */

import { describe, test, expect } from 'bun:test';
import { detectHallucination } from '../../../src/services/hallucination-detector';

describe('detectHallucination — empty input branches', () => {
  test('empty reply returns no hallucination', async () => {
    const result = await detectHallucination('', [{ tool: 'query_bill', result: '{"total":100}' }]);
    expect(result.has_hallucination).toBe(false);
    expect(result.evidence).toBe('');
  });

  test('whitespace-only reply returns no hallucination', async () => {
    const result = await detectHallucination('   ', [{ tool: 'query_bill', result: '{"total":100}' }]);
    expect(result.has_hallucination).toBe(false);
    expect(result.evidence).toBe('');
  });

  test('empty tool results returns no hallucination', async () => {
    const result = await detectHallucination('Your bill is 100 yuan.', []);
    expect(result.has_hallucination).toBe(false);
    expect(result.evidence).toBe('');
  });

  test('result conforms to HallucinationResult interface', async () => {
    const result = await detectHallucination('', []);
    expect(typeof result.has_hallucination).toBe('boolean');
    expect(typeof result.evidence).toBe('string');
  });
});
