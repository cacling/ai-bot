/**
 * llm.test.ts — LLM 配置测试
 */

import { describe, test, expect } from 'bun:test';
import { siliconflow, chatModel, skillCreatorModel } from '../../../../backend/src/engine/llm';

describe('LLM 配置导出', () => {
  test('siliconflow provider 是函数', () => {
    expect(typeof siliconflow).toBe('function');
  });

  test('chatModel 已定义', () => {
    expect(chatModel).toBeDefined();
  });

  test('skillCreatorModel 已定义', () => {
    expect(skillCreatorModel).toBeDefined();
  });

  test('siliconflow 可用于创建模型实例', () => {
    const model = siliconflow('test-model');
    expect(model).toBeDefined();
  });
});
