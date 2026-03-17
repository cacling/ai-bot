/**
 * hallucination-detector.test.ts — 幻觉检测测试
 *
 * 仅测试纯逻辑分支（空输入/无工具结果），不调用 LLM。
 */

import { describe, test, expect } from 'bun:test';
import { detectHallucination, type HallucinationResult } from '../../../../backend/src/services/hallucination-detector';

describe('detectHallucination — 纯逻辑分支', () => {
  test('空回复返回无幻觉', async () => {
    const result = await detectHallucination('', [{ tool: 'query_bill', result: '{"total":100}' }]);
    expect(result.has_hallucination).toBe(false);
    expect(result.evidence).toBe('');
  });

  test('空白回复返回无幻觉', async () => {
    const result = await detectHallucination('   ', [{ tool: 'query_bill', result: '{"total":100}' }]);
    expect(result.has_hallucination).toBe(false);
    expect(result.evidence).toBe('');
  });

  test('无工具结果返回无幻觉', async () => {
    const result = await detectHallucination('您好，请问有什么可以帮您？', []);
    expect(result.has_hallucination).toBe(false);
    expect(result.evidence).toBe('');
  });

  test('返回的类型符合 HallucinationResult 接口', async () => {
    const result = await detectHallucination('', []);
    expect(typeof result.has_hallucination).toBe('boolean');
    expect(typeof result.evidence).toBe('string');
  });
});
