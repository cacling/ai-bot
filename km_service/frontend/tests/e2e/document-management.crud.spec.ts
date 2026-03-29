/**
 * 知识资产管理 — 文档管理 CRUD E2E 测试
 *
 * feature-map: 6.1 文档管理
 * 入口: /agent → "知识库" tab → 左侧 "文档管理"
 * API: /api/km/documents, /api/km/documents/:id
 */
import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:18472';

test.describe('文档列表 API', () => {
  test.skip('KM-DOC-01: GET /api/km/documents 返回文档列表', async ({ request }) => {});
  test.skip('KM-DOC-02: 支持分页参数 limit/offset', async ({ request }) => {});
});

test.describe('文档 CRUD', () => {
  test.skip('KM-DOC-03: POST /api/km/documents 创建文档', async ({ request }) => {});
  test.skip('KM-DOC-04: GET /api/km/documents/:id 获取文档详情', async ({ request }) => {});
  test.skip('KM-DOC-05: PUT /api/km/documents/:id 更新文档', async ({ request }) => {});
  test.skip('KM-DOC-06: DELETE /api/km/documents/:id 删除文档', async ({ request }) => {});
});

test.describe('文档解析管线', () => {
  test.skip('KM-DOC-07: POST /api/km/documents/:id/parse 触发 parse→chunk→generate→validate', async ({ request }) => {});
});
