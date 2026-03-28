/**
 * mcp-client.ts — MCP 工具调用客户端
 *
 * 封装对工具的调用，被 voice.ts / outbound.ts 使用。
 * 内部委托给 Tool Runtime 统一执行管线。
 */

import { logger } from './logger';
import { ToolRuntime } from '../tool-runtime';

let runtimeInstance: ToolRuntime | null = null;

function getRuntime(): ToolRuntime {
  if (!runtimeInstance) {
    runtimeInstance = new ToolRuntime();
  }
  return runtimeInstance;
}

/** Refresh the runtime registry (call after tool config changes) */
export function refreshMcpClient(): void {
  if (runtimeInstance) runtimeInstance.refresh();
}

export async function callMcpTool(
  sessionId: string,
  name: string,
  args: Record<string, unknown>,
  channel: 'voice' | 'outbound' = 'voice',
): Promise<{ text: string; success: boolean }> {
  const runtime = getRuntime();

  const result = await runtime.call({
    toolName: name,
    args,
    channel,
    sessionId,
  });

  logger.info('mcp-client', 'tool_via_runtime', {
    session: sessionId,
    tool: name,
    success: result.success,
    source: result.source,
    latencyMs: result.latencyMs,
    trace: result.traceId,
  });

  return { text: result.rawText, success: result.success };
}
