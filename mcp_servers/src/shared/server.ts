/**
 * MCP Server 共享基础设施
 *
 * - DB 连接（使用 @ai-bot/shared-db 的 schema + env）
 * - startMcpHttpServer()
 * - mcpLog()
 * - monthLabel()
 * - re-export 常用依赖
 */
import path from "node:path";
import http from "node:http";
import { performance } from "node:perf_hooks";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { resolveSqlitePath } from "@ai-bot/shared-db/env";
import * as businessSchema from "@ai-bot/shared-db/schema/business";

// ── DB 连接 ──────────────────────────────────────────────────────────────────

const dbPath = resolveSqlitePath(
  path.resolve(import.meta.dirname, "../../../data/telecom.db"),
);
const client = createClient({ url: `file:${dbPath}` });
await client.execute("PRAGMA journal_mode = WAL");

export const db = drizzle(client, { schema: businessSchema });

// Re-export business schema tables for convenience
export const {
  plans, valueAddedServices, subscribers, subscriberSubscriptions,
  bills, callbackTasks, deviceContexts,
} = businessSchema;

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
    console.log(`[${name}] MCP endpoint: http://0.0.0.0:${port}/mcp`);
  });
}

// ── Re-exports ───────────────────────────────────────────────────────────────

export { eq, and } from "drizzle-orm";
export { z } from "zod";
export { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export { performance } from "node:perf_hooks";
