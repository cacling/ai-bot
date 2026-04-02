/**
 * Live API test: verify OpenAI (GPT-5.4) and Qwen provider connectivity
 *
 * 该测试直接调用 LLM API（非 mock），用于验证 .env 中的 API Key 和模型配置是否正确。
 * 运行方式：cd km_service && bun test tests/apitest/skills/llm-provider.test.ts
 *
 * 注意：需要有效的 API Key 和网络连接，CI 中可跳过。
 */
import { describe, test, expect } from 'bun:test';
import { generateText } from 'ai';
import { getSkillCreatorModels, type SkillCreatorProvider } from '../../../src/llm';

const TIMEOUT = 60_000;

describe('LLM Provider connectivity', () => {

  test('qwen: basic chat completion', async () => {
    const { model } = getSkillCreatorModels('qwen');
    const { text } = await generateText({
      model,
      messages: [{ role: 'user', content: '请用一句话介绍自己' }],
      maxTokens: 100,
    });
    console.log('[qwen] response:', text.slice(0, 200));
    expect(text.length).toBeGreaterThan(0);
  }, TIMEOUT);

  test('openai: basic chat completion', async () => {
    const { model } = getSkillCreatorModels('openai');
    const { text } = await generateText({
      model,
      messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
      maxTokens: 100,
    });
    console.log('[openai] response:', text.slice(0, 200));
    expect(text.length).toBeGreaterThan(0);
  }, TIMEOUT);

  test('openai: thinking model (reasoning)', async () => {
    const { thinkingModel } = getSkillCreatorModels('openai');
    const { text, reasoning } = await generateText({
      model: thinkingModel,
      messages: [{ role: 'user', content: 'What is 15 * 37? Think step by step.' }],
      maxTokens: 500,
    });
    console.log('[openai-thinking] reasoning:', String(reasoning).slice(0, 300));
    console.log('[openai-thinking] answer:', text.slice(0, 200));
    expect(text.length).toBeGreaterThan(0);
  }, TIMEOUT);

});
