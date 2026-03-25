/**
 * 知识资产管理 — 审核包工作流 E2E 测试
 *
 * feature-map: 6.5 审核包工作流 + 6.6 动作执行
 * 入口: /agent → "知识库" tab → 左侧 "评审与发布"
 * API: /api/km/review-packages, /api/km/action-drafts
 */
import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:18472';

test.describe('审核包管理', () => {
  test.skip('KM-REV-01: GET /api/km/review-packages 返回审核包列表', async ({ request }) => {});
  test.skip('KM-REV-02: POST /api/km/review-packages 创建审核包并关联候选', async ({ request }) => {});
  test.skip('KM-REV-03: 提交审核——三门不通过时返回 blockers 列表', async ({ request }) => {});
  test.skip('KM-REV-04: 审核通过后候选状态变为 published', async ({ request }) => {});
  test.skip('KM-REV-05: 审核驳回后候选状态变为 rejected', async ({ request }) => {});
});

test.describe('动作执行', () => {
  test.skip('KM-ACT-01: POST /api/km/action-drafts 创建 publish 动作', async ({ request }) => {});
  test.skip('KM-ACT-02: 执行 rollback 动作后资产恢复到回滚点', async ({ request }) => {});
  test.skip('KM-ACT-03: 执行 unpublish 动作后资产状态变为 unpublished', async ({ request }) => {});
});
