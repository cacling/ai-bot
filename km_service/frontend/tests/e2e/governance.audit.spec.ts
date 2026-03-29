/**
 * 知识资产管理 — 治理任务与审计日志 E2E 测试
 *
 * feature-map: 6.8 治理任务 + 6.9 审计日志
 * 入口: /agent → "知识库" tab → 左侧 "运维与治理"
 * API: /api/km/tasks, /api/km/audit-logs
 */
import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:18472';

test.describe('治理任务', () => {
  test.skip('KM-GOV-01: GET /api/km/tasks 返回任务列表', async ({ request }) => {});
  test.skip('KM-GOV-02: 任务按优先级排序 (urgent > high > medium > low)', async ({ request }) => {});
  test.skip('KM-GOV-03: 任务类型包含 expiry_review/content_gap/conflict_arbitration 等', async ({ request }) => {});
});

test.describe('审计日志', () => {
  test.skip('KM-AUDIT-01: GET /api/km/audit-logs 返回审计日志列表', async ({ request }) => {});
  test.skip('KM-AUDIT-02: 日志包含 action/object_type/object_id/operator/risk_level', async ({ request }) => {});
  test.skip('KM-AUDIT-03: 审计日志只读，不支持 DELETE', async ({ request }) => {});
});
