/**
 * 灰度发布 — API 契约 E2E 测试
 *
 * feature-map: 5.6 灰度发布
 * 无独立部署 UI，通过 API 直接测试
 * API: /api/canary/*
 */
import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:18472';

test.describe('灰度部署', () => {
  test.skip('CANARY-01: POST /api/canary/deploy 部署技能到灰度', async ({ request }) => {});
  test.skip('CANARY-02: GET /api/canary/status 查询灰度状态', async ({ request }) => {});
  test.skip('CANARY-03: 灰度百分比按手机尾号分流', async ({ request }) => {});
});

test.describe('灰度转正与回滚', () => {
  test.skip('CANARY-04: POST /api/canary/promote 灰度转正', async ({ request }) => {});
  test.skip('CANARY-05: DELETE /api/canary 取消灰度回滚', async ({ request }) => {});
});
