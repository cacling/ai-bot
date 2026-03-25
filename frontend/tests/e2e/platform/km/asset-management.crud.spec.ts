/**
 * 知识资产管理 — 已发布资产管理 E2E 测试
 *
 * feature-map: 6.7 已发布资产管理
 * 入口: /agent → "知识库" tab → 左侧 "资产中心"
 * API: /api/km/assets
 */
import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:18472';

test.describe('资产列表与详情', () => {
  test.skip('KM-ASSET-01: GET /api/km/assets 返回资产列表', async ({ request }) => {});
  test.skip('KM-ASSET-02: 资产状态包含 online/canary/downgraded/unpublished', async ({ request }) => {});
  test.skip('KM-ASSET-03: GET /api/km/assets/:id 返回资产详情含版本历史', async ({ request }) => {});
});

test.describe('资产状态变更', () => {
  test.skip('KM-ASSET-04: 灰度资产在列表中显示 canary 状态标签', async ({ request }) => {});
  test.skip('KM-ASSET-05: downgrade 后资产状态变为 downgraded', async ({ request }) => {});
});
