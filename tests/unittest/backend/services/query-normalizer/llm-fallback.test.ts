import { describe, test, expect } from 'bun:test';
import { buildFallbackPrompt } from '../../../../../backend/src/services/query-normalizer/llm-fallback';

describe('llm-fallback', () => {
  test('buildFallbackPrompt includes original query', () => {
    const prompt = buildFallbackPrompt('我那个啥包好像多扣了', { issue_type: 'unexpected_charge' });
    expect(prompt).toContain('我那个啥包好像多扣了');
    expect(prompt).toContain('unexpected_charge');
  });

  test('buildFallbackPrompt includes rules result', () => {
    const prompt = buildFallbackPrompt('测试', { action_type: 'cancel_service' });
    expect(prompt).toContain('cancel_service');
  });

  test('buildFallbackPrompt contains instruction not to expand scope', () => {
    const prompt = buildFallbackPrompt('查话费', {});
    expect(prompt).toContain('不要扩大');
  });
});
