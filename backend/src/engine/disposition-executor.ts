/**
 * DispositionExecutor — L4 Disposition 模式执行器
 *
 * LLM 不再直接调用写操作工具，而是输出结构化 disposition JSON。
 * 应用层解析 disposition，执行用户确认后调用底层工具。
 *
 * 关键语义：
 * - registry.resolve() 能找到 disabled 工具（不受 getToolSurface 过滤）
 * - 写操作工具标记 disabled 后，LLM 看不到但 disposition 可调用
 */
import { ToolRuntime } from '../tool-runtime';
import { logger } from '../services/logger';
import type { RuntimeChannel } from '../tool-runtime/types';

export interface Disposition {
  action: string;
  params: Record<string, unknown>;
  confirmed: boolean;
}

export interface DispositionContext {
  sessionId: string;
  channel: RuntimeChannel;
  userPhone?: string;
  traceId?: string;
}

/**
 * Parse disposition JSON from LLM output text.
 * Returns null if the text doesn't contain a valid disposition.
 */
export function parseDisposition(text: string): Disposition | null {
  // Look for ```json ... ``` blocks or raw JSON with "action" field
  const jsonBlockMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```/);
  const raw = jsonBlockMatch ? jsonBlockMatch[1].trim() : text.trim();

  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.action === 'string' && typeof obj.params === 'object') {
      return {
        action: obj.action,
        params: obj.params ?? {},
        confirmed: obj.confirmed === true,
      };
    }
  } catch {
    // Not a JSON string — not a disposition
  }
  return null;
}

/**
 * Execute a confirmed disposition by calling the underlying tool via ToolRuntime.
 * The tool may be disabled (not in getToolSurface) but resolve() will find it.
 */
export async function executeDisposition(
  runtime: ToolRuntime,
  disposition: Disposition,
  ctx: DispositionContext,
): Promise<{ success: boolean; result: unknown; error?: string }> {
  if (!disposition.confirmed) {
    return { success: false, result: null, error: 'User confirmation required before executing disposition' };
  }

  try {
    const result = await runtime.call({
      toolName: disposition.action,
      args: disposition.params,
      channel: ctx.channel,
      sessionId: ctx.sessionId,
      userPhone: ctx.userPhone,
      traceId: ctx.traceId,
    });

    logger.info('disposition', 'executed', {
      action: disposition.action,
      success: result.success,
      session: ctx.sessionId,
      trace: ctx.traceId,
    });

    return { success: result.success, result: result.parsed };
  } catch (err) {
    logger.error('disposition', 'execution_failed', {
      action: disposition.action,
      error: String(err),
      session: ctx.sessionId,
    });
    return { success: false, result: null, error: String(err) };
  }
}
