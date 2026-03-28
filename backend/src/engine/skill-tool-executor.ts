import { isErrorResult } from '../services/tool-result';
import { logger } from '../services/logger';

export interface ToolExecResult {
  success: boolean;
  hasData: boolean;
  rawText: string;
  parsed: unknown;
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  mcpTools: Record<string, { execute: (...args: any[]) => Promise<any> }>,
): Promise<ToolExecResult> {
  const tool = mcpTools[toolName];
  if (!tool) {
    logger.warn('skill-tool-executor', 'tool_not_found', { tool: toolName });
    return { success: false, hasData: false, rawText: `Tool "${toolName}" not found`, parsed: null };
  }
  try {
    const result = await tool.execute(args);
    let text = '';
    if (typeof result === 'string') text = result;
    else if (result?.content?.[0]?.text) text = result.content[0].text;
    else text = JSON.stringify(result);

    const success = !isErrorResult(text);
    const hasData = success && !/not found|无记录|未查到|no data|不存在/i.test(text);
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    logger.info('skill-tool-executor', 'executed', { tool: toolName, success, hasData });
    return { success, hasData, rawText: text, parsed };
  } catch (err) {
    logger.error('skill-tool-executor', 'exec_error', { tool: toolName, error: String(err) });
    return { success: false, hasData: false, rawText: String(err), parsed: null };
  }
}

export function buildToolArgs(
  toolName: string,
  sessionContext: { phone: string; sessionId: string },
  existingArgs?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    phone: sessionContext.phone,
    ...existingArgs,
  };
}

/**
 * Execute a tool via the unified runtime. Returns the same ToolExecResult shape
 * for backward compatibility with skill-runtime.ts and workflow executors.
 */
export async function executeToolViaRuntime(
  toolName: string,
  args: Record<string, unknown>,
  runtime: import('../tool-runtime').ToolRuntime,
  context: { sessionId: string; phone: string; channel?: 'online' | 'voice' | 'outbound' | 'workflow'; activeSkillName?: string | null },
): Promise<ToolExecResult> {
  const result = await runtime.call({
    toolName,
    args,
    channel: context.channel ?? 'workflow',
    sessionId: context.sessionId,
    userPhone: context.phone,
    activeSkillName: context.activeSkillName,
  });

  return {
    success: result.success,
    hasData: result.hasData,
    rawText: result.rawText,
    parsed: result.parsed,
  };
}
