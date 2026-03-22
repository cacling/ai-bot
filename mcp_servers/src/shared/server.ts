/**
 * MCP Server 共享基础设施（重构2：MCP Server = 防腐层）
 *
 * - Backend HTTP client（调用 mock_apis / 未来真实系统）
 * - startMcpHttpServer()
 * - mcpLog()
 * - monthLabel()
 * - re-export 常用依赖
 */
import http from "node:http";
import { performance } from "node:perf_hooks";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// ── Backend Systems HTTP Client ─────────────────────────────────────────────
// demo 阶段指向 mock_apis，生产阶段替换为真实系统 URL

export const BACKEND_URL = process.env.MOCK_API_URL ?? 'http://127.0.0.1:18008';

export async function backendGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Backend GET ${path} failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function backendPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend POST ${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function mcpLog(mod: string, tool: string, extra: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), mod, tool, ...extra }));
}

export function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${y}年${parseInt(m, 10)}月`;
}

/** Start an MCP HTTP server */
export function startMcpHttpServer(name: string, port: number, createServer: () => McpServer) {
  const httpServer = http.createServer(async (req, res) => {
    if (req.url !== "/mcp") { res.writeHead(404).end("Not found"); return; }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const mcpServer = createServer();
    res.on("close", () => { mcpServer.close().catch(() => {}); });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  });
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`[${name}] MCP endpoint: http://0.0.0.0:${port}/mcp (backend: ${BACKEND_URL})`);
  });
}

// ── Re-exports ───────────────────────────────────────────────────────────────

export { z } from "zod";
export { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export { performance } from "node:perf_hooks";
