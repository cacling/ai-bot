/**
 * mcp/mcp-resources-catalog.ts — MCP Resources 聚合发现
 *
 * 遍历所有已启用的 MCP Server，调用 resources/list 收集所有 URI 资源。
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
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }> = [];

  for (const server of servers) {
    try {
      const mcpClient = new Client({ name: 'catalog-resources', version: '1.0' });
      await mcpClient.connect(new StreamableHTTPClientTransport(new URL(server.url!)));
      try {
        const { resources } = await mcpClient.listResources();
        for (const r of resources ?? []) {
          results.push({
            server_id: server.id,
            server_name: server.name,
            uri: r.uri,
            name: r.name ?? r.uri,
            description: r.description,
            mimeType: r.mimeType,
          });
        }
      } catch { /* Server doesn't support resources/list */ }
      await mcpClient.close();
    } catch (err) {
      logger.warn('mcp', 'catalog_resources_skip', { server: server.name, error: String(err) });
    }
  }

  return c.json({ items: results, servers_scanned: servers.length });
});

export default app;
