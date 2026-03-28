import type { Adapter, AdapterCallContext, AdapterType } from '../types';
import { isErrorResult, isNoDataResult } from '../../services/tool-result';
import { logger } from '../../services/logger';
import type { ToolRegistry } from '../registry';

export type ScriptCallTool = (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
export type ScriptHandler = (args: Record<string, unknown>, callTool: ScriptCallTool) => Promise<unknown>;

const handlers = new Map<string, ScriptHandler>();

export function registerScriptHandler(key: string, handler: ScriptHandler): void {
  handlers.set(key, handler);
}

export class ScriptAdapter implements Adapter {
  type: AdapterType = 'script';
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
    const handlerKey = ctx.resolved.binding?.handlerKey;

    // 1. Try in-memory handler first
    if (handlerKey) {
      const handler = handlers.get(handlerKey);
      if (handler) {
        const callTool: ScriptCallTool = async (subToolName, subArgs) => {
          const poolTool = this.mcpTools[subToolName];
          if (poolTool) {
            const result = await poolTool.execute(subArgs);
            if (result?.content?.[0]?.text) {
              try { return JSON.parse(result.content[0].text); } catch { return result.content[0].text; }
            }
            return result;
          }
          throw new Error(`Sub-tool "${subToolName}" not found in MCP pool`);
        };
        return this.callHandler(toolName, handlerKey, args, handler, callTool);
      }
    }

    // 2. Fallback: MCP tool pool (persistent connection to internal MCP servers)
    const poolTool = this.mcpTools[toolName];
    if (poolTool) {
      return this.callViaMcpPool(toolName, args, poolTool);
    }

    // 3. Fallback: per-call HTTP to internal MCP server
    const serverUrl = this.resolveServerUrl(ctx);
    if (serverUrl) {
      return this.callViaHttp(toolName, args, serverUrl);
    }

    return { rawText: `Script tool "${toolName}" has no handler, pool entry, or server URL`, parsed: null, success: false, hasData: false };
  }

  private async callHandler(
    toolName: string, handlerKey: string, args: Record<string, unknown>,
    handler: ScriptHandler, callTool: ScriptCallTool,
  ): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    try {
      const result = await handler(args, callTool);
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      const success = !isErrorResult(text);
      const hasData = success && !isNoDataResult(text);
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = result; }

      logger.info('script-adapter', 'executed', { tool: toolName, handler: handlerKey, success });
      return { rawText: text, parsed, success, hasData };
    } catch (err) {
      logger.error('script-adapter', 'handler_error', { tool: toolName, handler: handlerKey, error: String(err) });
      return { rawText: `Script execution failed: ${String(err)}`, parsed: null, success: false, hasData: false };
    }
  }

  private async callViaMcpPool(
    toolName: string, args: Record<string, unknown>,
    tool: { execute: (...args: any[]) => Promise<any> },
  ): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    try {
      const result = await tool.execute(args);
      let text = '';
      if (typeof result === 'string') text = result;
      else if (result?.content?.[0]?.text) text = result.content[0].text;
      else text = JSON.stringify(result);

      const success = !isErrorResult(text);
      const hasData = success && !isNoDataResult(text);
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = text; }

      logger.info('script-adapter', 'mcp_pool', { tool: toolName, success });
      return { rawText: text, parsed, success, hasData };
    } catch (err) {
      logger.error('script-adapter', 'mcp_pool_error', { tool: toolName, error: String(err) });
      return { rawText: String(err), parsed: null, success: false, hasData: false };
    }
  }

  private async callViaHttp(
    toolName: string, args: Record<string, unknown>, url: string,
  ): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    try {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

      const client = new Client({ name: 'script-adapter', version: '1.0' });
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
      logger.error('script-adapter', 'http_error', { tool: toolName, url, error: String(err) });
      return { rawText: JSON.stringify({ error: `Script tool call failed: ${String(err)}` }), parsed: null, success: false, hasData: false };
    }
  }

  private resolveServerUrl(ctx: AdapterCallContext): string | null {
    if (ctx.resolved.contract.serverId && this.registry) {
      return this.registry.getServerUrl(ctx.resolved.contract.serverId) ?? null;
    }
    return null;
  }
}
