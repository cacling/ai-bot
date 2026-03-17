/**
 * mcp-client.ts — MCP 工具调用客户端
 *
 * 封装对 MCP 服务器的工具调用，被 voice.ts / outbound.ts 使用。
 * 所有工具统一由 telecom-service MCP Server 提供。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { logger } from './logger';

const TELECOM_MCP_URL = process.env.TELECOM_MCP_URL ?? 'http://localhost:8003/mcp';

export async function callMcpTool(
  sessionId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; success: boolean }> {
  const client = new Client({ name: 'voice-agent', version: '1.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(TELECOM_MCP_URL)));
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ type: string; text: string }>)
      .filter(c => c.type === 'text').map(c => c.text).join('\n');
    logger.info('voice', 'mcp_tool_result', { session: sessionId, tool: name, preview: text.slice(0, 200) });
    return { text, success: true };
  } catch (e) {
    const errStr = String(e);
    logger.error('voice', 'mcp_tool_error', { session: sessionId, tool: name, error: errStr });
    return { text: JSON.stringify({ error: `Tool call failed: ${errStr}` }), success: false };
  } finally {
    await client.close().catch(() => {});
  }
}
