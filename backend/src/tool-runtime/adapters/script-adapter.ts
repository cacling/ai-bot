import type { Adapter, AdapterCallContext, AdapterType } from '../types';
import { isErrorResult, isNoDataResult } from '../../services/tool-result';
import { logger } from '../../services/logger';

const handlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();

export function registerScriptHandler(key: string, handler: (args: Record<string, unknown>) => Promise<unknown>): void {
  handlers.set(key, handler);
}

export class ScriptAdapter implements Adapter {
  type: AdapterType = 'script';

  async call(ctx: AdapterCallContext): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    const { toolName, args } = ctx.request;
    const handlerKey = ctx.resolved.binding?.handlerKey;

    if (!handlerKey) {
      return { rawText: `No handler key for script tool "${toolName}"`, parsed: null, success: false, hasData: false };
    }

    const handler = handlers.get(handlerKey);
    if (!handler) {
      return { rawText: `Script handler "${handlerKey}" not registered`, parsed: null, success: false, hasData: false };
    }

    try {
      const result = await handler(args as Record<string, unknown>);
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      const success = !isErrorResult(text);
      const hasData = success && !isNoDataResult(text);
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = result; }

      logger.info('script-adapter', 'executed', { tool: toolName, handler: handlerKey, success });
      return { rawText: text, parsed, success, hasData };
    } catch (err) {
      logger.error('script-adapter', 'error', { tool: toolName, handler: handlerKey, error: String(err) });
      return { rawText: `Script execution failed: ${String(err)}`, parsed: null, success: false, hasData: false };
    }
  }
}
