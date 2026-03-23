/**
 * translate-lang.test.ts — 翻译模块测试
 *
 * 仅测试不调用 LLM 的纯逻辑分支（中文源语言直接返回）。
 */

import { describe, test, expect } from 'bun:test';
import { translateMermaid } from '../../../src/services/translate-lang';

describe('translateMermaid — 中文直接返回', () => {
  test('目标语言为 zh 时直接返回原文', async () => {
    const mermaid = `stateDiagram-v2
    [*] --> 接入
    接入 --> 查询账户`;
    const result = await translateMermaid(mermaid, 'zh');
    expect(result).toBe(mermaid);
  });

  test('目标语言为 zh 时空字符串也直接返回', async () => {
    const result = await translateMermaid('', 'zh');
    expect(result).toBe('');
  });
});
