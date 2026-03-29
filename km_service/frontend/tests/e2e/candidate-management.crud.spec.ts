/**
 * 知识资产管理 — QA 候选管理 CRUD E2E 测试
 *
 * feature-map: 6.2 QA 候选管理
 * 入口: /agent → "知识库" tab → 左侧 "知识候选"
 * API: /api/km/candidates
 */
import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:18472';

test.describe('候选列表', () => {
  test.skip('KM-CAND-01: GET /api/km/candidates 返回候选列表', async ({ request }) => {});
  test.skip('KM-CAND-02: 支持按 status 筛选 (draft/gate_pass/in_review/published)', async ({ request }) => {});
});

test.describe('候选 CRUD', () => {
  test.skip('KM-CAND-03: POST /api/km/candidates 手动创建候选', async ({ request }) => {});
  test.skip('KM-CAND-04: PUT /api/km/candidates/:id 更新候选字段', async ({ request }) => {});
});

test.describe('三门验证', () => {
  test.skip('KM-CAND-05: 证据门——无 pass 证据时 gate_check 失败', async ({ request }) => {});
  test.skip('KM-CAND-06: 冲突门——有 pending 阻断冲突时 gate_check 失败', async ({ request }) => {});
  test.skip('KM-CAND-07: 归属门——未关联目标资产时 gate_check 失败', async ({ request }) => {});
  test.skip('KM-CAND-08: 三门全通过后状态变为 gate_pass', async ({ request }) => {});
});
