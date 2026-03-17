/**
 * progress-tracker.test.ts — 流程进度追踪测试
 *
 * 仅测试纯逻辑分支（空输入），不调用 LLM。
 */

import { describe, test, expect } from 'bun:test';
import { analyzeProgress } from '../../../../backend/src/agent/card/progress-tracker';

describe('analyzeProgress — 纯逻辑分支', () => {
  test('空状态列表返回 null', async () => {
    const result = await analyzeProgress(
      [{ role: 'user', text: '你好' }],
      [],
    );
    expect(result).toBeNull();
  });

  test('空对话轮次返回 null', async () => {
    const result = await analyzeProgress(
      [],
      ['接入', '查询', '解决'],
    );
    expect(result).toBeNull();
  });

  test('两个参数都为空返回 null', async () => {
    const result = await analyzeProgress([], []);
    expect(result).toBeNull();
  });
});
