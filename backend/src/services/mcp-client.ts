/**
 * mcp-client.ts — MCP 工具调用客户端
 *
 * 封装对 MCP 服务器的工具调用，被 voice.ts / outbound.ts 使用。
 * 从 DB 查询工具所在的 MCP Server URL，按工具名路由。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { logger } from './logger';
import { db } from '../db';
import { mcpServers } from '../db/schema';

const FALLBACK_URL = process.env.TELECOM_MCP_URL ?? 'http://127.0.0.1:18003/mcp';

/** Build a map of tool_name → server URL from DB */
function buildToolUrlMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    for (const server of db.select().from(mcpServers).all()) {
      if (!server.enabled || server.status !== 'active' || !server.url) continue;
      const tools = server.tools_json ? JSON.parse(server.tools_json) as Array<{ name: string }> : [];
      for (const t of tools) map.set(t.name, server.url);
    }
  } catch { /* DB not ready */ }
  return map;
}

// Cache the map, rebuild every 30s
let toolUrlMap = buildToolUrlMap();
let mapBuiltAt = Date.now();

function getToolUrl(toolName: string): string {
  if (Date.now() - mapBuiltAt > 30_000) {
    toolUrlMap = buildToolUrlMap();
    mapBuiltAt = Date.now();
  }
  return toolUrlMap.get(toolName) ?? FALLBACK_URL;
}

export async function callMcpTool(
  sessionId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; success: boolean }> {
  const url = getToolUrl(name);
  const client = new Client({ name: 'voice-agent', version: '1.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ type: string; text: string }>)
      .filter(c => c.type === 'text').map(c => c.text).join('\n');
    logger.info('voice', 'mcp_tool_result', { session: sessionId, tool: name, url, preview: text.slice(0, 200) });
    return { text, success: true };
  } catch (e) {
    const errStr = String(e);
    logger.error('voice', 'mcp_tool_error', { session: sessionId, tool: name, url, error: errStr });
    return { text: JSON.stringify({ error: `Tool call failed: ${errStr}` }), success: false };
  } finally {
    await client.close().catch(() => {});
  }
}
