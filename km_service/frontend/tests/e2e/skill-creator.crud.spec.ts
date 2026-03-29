/**
 * AI 技能创建器 E2E 测试
 *
 * feature-map: 5.4 AI 技能创建器
 * 入口: /agent → 技能编辑器 → "AI 创建" 面板
 * API: /api/skill-creator/chat, /api/skill-creator/save
 */
import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:18472';

test.describe('技能创建对话', () => {
  test.skip('CREATOR-01: POST /api/skill-creator/chat 发起需求访谈', async ({ request }) => {});
  test.skip('CREATOR-02: 多轮对话推进 interview → draft → confirm', async ({ request }) => {});
  test.skip('CREATOR-03: LLM 自动生成 3-5 条测试用例', async ({ request }) => {});
});

test.describe('技能保存', () => {
  test.skip('CREATOR-04: POST /api/skill-creator/save 保存合法技能', async ({ request }) => {});
  test.skip('CREATOR-05: 非法 skill_name 返回 400', async ({ request }) => {});
  test.skip('CREATOR-06: 结构校验不通过返回 422 含 validation_errors', async ({ request }) => {});
});
