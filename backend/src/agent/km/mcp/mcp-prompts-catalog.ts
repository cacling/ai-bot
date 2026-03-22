/**
 * mcp/mcp-prompts-catalog.ts — MCP Prompts 聚合发现
 *
 * 遍历所有已启用的 MCP Server，调用 prompts/list 收集所有 Prompt 模板。
 */
import { Hono } from 'hono';
import { db } from '../../../db';
import { mcpServers } from '../../../db/schema';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { logger } from '../../../services/logger';

const app = new Hono();

app.get('/', async (c) => {
  const servers = db.select().from(mcpServers).all()
    .filter(s => s.enabled && s.status === 'active' && s.url);

  const results: Array<{
    server_id: string;
    server_name: string;
    name: string;
    description?: string;
    arguments?: unknown[];
  }> = [];

  for (const server of servers) {
    try {
      const mcpClient = new Client({ name: 'catalog-prompts', version: '1.0' });
      await mcpClient.connect(new StreamableHTTPClientTransport(new URL(server.url!)));
      try {
        const { prompts } = await mcpClient.listPrompts();
        for (const p of prompts ?? []) {
          results.push({
            server_id: server.id,
            server_name: server.name,
            name: p.name,
            description: p.description,
            arguments: p.arguments,
          });
        }
      } catch { /* Server doesn't support prompts/list */ }
      await mcpClient.close();
    } catch (err) {
      logger.warn('mcp', 'catalog_prompts_skip', { server: server.name, error: String(err) });
    }
  }

  return c.json({ items: results, servers_scanned: servers.length });
});

export default app;
