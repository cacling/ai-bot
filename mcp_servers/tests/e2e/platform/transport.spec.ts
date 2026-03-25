/**
 * StreamableHTTP 传输层 E2E 测试
 *
 * 验证 MCP StreamableHTTP stateless 传输协议的合规性。
 * 需要启动: 至少 1 个 MCP server (如 user-info-service:18003)
 */
import { describe, test, expect } from 'bun:test';

const MCP_URL = 'http://localhost:18003/mcp';

describe('StreamableHTTP 协议', () => {
  test.skip('POST /mcp 接受 application/json Content-Type', async () => {});
  test.skip('响应 Content-Type 为 application/json', async () => {});
  test.skip('无状态：不同请求无需 session header', async () => {});
  test.skip('支持 JSON-RPC 2.0 请求格式 {jsonrpc, method, params, id}', async () => {});
  test.skip('返回 JSON-RPC 2.0 响应格式 {jsonrpc, result, id}', async () => {});
});

describe('协议错误处理', () => {
  test.skip('非 JSON body → 返回 JSON-RPC error', async () => {});
  test.skip('缺少 method 字段 → 返回 invalid request error', async () => {});
  test.skip('未知 method → 返回 method not found error', async () => {});
  test.skip('GET /mcp → 返回 405 Method Not Allowed', async () => {});
});
