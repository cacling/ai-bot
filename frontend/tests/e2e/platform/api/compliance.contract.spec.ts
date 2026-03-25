/**
 * 合规用语拦截 — API 契约 E2E 测试
 *
 * feature-map: 7.1 合规用语拦截
 * 无独立 UI，通过 API 直接测试
 * API: /api/compliance/keywords, /api/compliance/check
 */
import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:18472';

test.describe('合规词库查询', () => {
  test.skip('COMPL-01: GET /api/compliance/keywords 返回词库列表', async ({ request }) => {});
  test.skip('COMPL-02: 词库包含 banned/warning/pii 三种分类', async ({ request }) => {});
});

test.describe('合规词库管理', () => {
  test.skip('COMPL-03: POST /api/compliance/keywords 新增敏感词', async ({ request }) => {});
  test.skip('COMPL-04: DELETE /api/compliance/keywords/:id 删除敏感词', async ({ request }) => {});
  test.skip('COMPL-05: POST /api/compliance/keywords/reload 热重载 AC 自动机', async ({ request }) => {});
});

test.describe('在线检测', () => {
  test.skip('COMPL-06: POST /api/compliance/check 检测 banned 词命中', async ({ request }) => {});
  test.skip('COMPL-07: POST /api/compliance/check 检测 pii 脱敏（身份证号/银行卡号）', async ({ request }) => {});
  test.skip('COMPL-08: POST /api/compliance/check 干净文本无命中', async ({ request }) => {});
});
