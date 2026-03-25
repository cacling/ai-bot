/**
 * MCP 管理 — Connector 管理 CRUD E2E 测试
 *
 * feature-map: 5.8 MCP 管理 (Connectors)
 * 入口: /agent → "工具管理" tab → "Connectors" 子 tab
 * API: /api/mcp/connectors
 */
import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:18472';

test.describe('Connector 列表', () => {
  test.skip('MCP-CONN-01: GET /api/mcp/connectors 返回连接器列表', async ({ request }) => {});
  test.skip('MCP-CONN-02: 支持按类型筛选 (api/remote_mcp)', async ({ request }) => {});
});

test.describe('Connector CRUD', () => {
  test.skip('MCP-CONN-03: POST /api/mcp/connectors 创建 API 类型连接器', async ({ request }) => {});
  test.skip('MCP-CONN-04: PUT /api/mcp/connectors/:id 更新连接器配置', async ({ request }) => {});
  test.skip('MCP-CONN-05: DELETE /api/mcp/connectors/:id 删除连接器', async ({ request }) => {});
});

test.describe('Connector 连通性', () => {
  test.skip('MCP-CONN-06: POST /api/mcp/connectors/:id/test 测试连接返回 elapsed_ms', async ({ request }) => {});
});
