import type { Adapter, AdapterCallContext, AdapterType } from '../types';
import { isErrorResult, isNoDataResult } from '../../services/tool-result';
import { logger } from '../../services/logger';
import type { ToolRegistry } from '../registry';

export class RemoteMcpAdapter implements Adapter {
  type: AdapterType = 'remote_mcp';
  private mcpTools: Record<string, { execute: (...args: any[]) => Promise<any> }> = {};
  private registry: ToolRegistry | null = null;

  setMcpTools(tools: Record<string, { execute: (...args: any[]) => Promise<any> }>): void {
    this.mcpTools = tools;
  }

  setRegistry(registry: ToolRegistry): void {
    this.registry = registry;
  }

  async call(ctx: AdapterCallContext): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    const { toolName, args } = ctx.request;

    // Try persistent pool first
    const tool = this.mcpTools[toolName];
    if (tool) {
      return this.callViaTool(toolName, args, tool);
    }

    // Fallback: per-call HTTP connection
    return this.callViaHttp(toolName, args, ctx);
  }

  private async callViaTool(
    toolName: string,
    args: Record<string, unknown>,
    tool: { execute: (...args: any[]) => Promise<any> },
  ): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    try {
      const result = await tool.execute(args);
      return this.parseResult(toolName, result);
    } catch (err) {
      logger.error('remote-mcp-adapter', 'pool_call_error', { tool: toolName, error: String(err) });
      return { rawText: String(err), parsed: null, success: false, hasData: false };
    }
  }

  private async callViaHttp(
    toolName: string,
    args: Record<string, unknown>,
    ctx: AdapterCallContext,
  ): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    let url = this.resolveUrl(toolName, ctx);
    if (!url) {
      url = process.env.TELECOM_MCP_URL ?? `http://127.0.0.1:${process.env.MCP_INTERNAL_PORT ?? 18003}/mcp`;
    }

    try {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

      const client = new Client({ name: 'tool-runtime', version: '1.0' });
      try {
        await client.connect(new StreamableHTTPClientTransport(new URL(url)));
        const result = await client.callTool({ name: toolName, arguments: args });
        const text = (result.content as Array<{ type: string; text: string }>)
          .filter(c => c.type === 'text').map(c => c.text).join('\n');

        const success = !isErrorResult(text);
        const hasData = success && !isNoDataResult(text);
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { parsed = text; }

        return { rawText: text, parsed, success, hasData };
      } finally {
        await client.close().catch(() => {});
      }
    } catch (err) {
      logger.error('remote-mcp-adapter', 'http_call_error', { tool: toolName, url, error: String(err) });
      return { rawText: JSON.stringify({ error: `Tool call failed: ${String(err)}` }), parsed: null, success: false, hasData: false };
    }
  }

  private resolveUrl(toolName: string, ctx: AdapterCallContext): string | null {
    if (ctx.resolved.connector?.config) {
      const url = (ctx.resolved.connector.config as any).url;
      if (url) return url;
    }
    if (ctx.resolved.contract.serverId && this.registry) {
      return this.registry.getServerUrl(ctx.resolved.contract.serverId) ?? null;
    }
    return null;
  }

  private parseResult(toolName: string, result: any): { rawText: string; parsed: unknown; success: boolean; hasData: boolean } {
    let text = '';
    if (typeof result === 'string') text = result;
    else if (result?.content?.[0]?.text) text = result.content[0].text;
    else text = JSON.stringify(result);

    const success = !isErrorResult(text);
    const hasData = success && !isNoDataResult(text);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    return { rawText: text, parsed, success, hasData };
  }
}
