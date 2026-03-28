import type { Adapter, AdapterCallContext, AdapterType } from '../types';
import { executeApiTool, type ApiExecutionConfig } from '../../services/api-executor';
import { isErrorResult, isNoDataResult } from '../../services/tool-result';
import { logger } from '../../services/logger';

export class ApiAdapter implements Adapter {
  type: AdapterType = 'api';

  async call(ctx: AdapterCallContext): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    const { toolName, args } = ctx.request;
    const { binding, connector } = ctx.resolved;

    const apiConfig = this.resolveApiConfig(binding?.config, connector?.config);
    if (!apiConfig) {
      return {
        rawText: `No API config found for tool "${toolName}"`,
        parsed: null,
        success: false,
        hasData: false,
      };
    }

    try {
      const result = await executeApiTool(apiConfig, args as Record<string, unknown>);
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      const success = !isErrorResult(text);
      const hasData = success && !isNoDataResult(text);
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = result; }

      logger.info('api-adapter', 'called', { tool: toolName, url: apiConfig.url, success });
      return { rawText: text, parsed, success, hasData };
    } catch (err) {
      logger.error('api-adapter', 'error', { tool: toolName, error: String(err) });
      return {
        rawText: `API call failed: ${String(err)}`,
        parsed: null,
        success: false,
        hasData: false,
      };
    }
  }

  private resolveApiConfig(
    bindingConfig?: Record<string, unknown>,
    connectorConfig?: Record<string, unknown>,
  ): ApiExecutionConfig | null {
    const api = bindingConfig?.api as ApiExecutionConfig | undefined;
    if (api?.url) return api;

    if (connectorConfig) {
      const baseUrl = (connectorConfig.base_url ?? connectorConfig.baseUrl) as string | undefined;
      const path = (bindingConfig?.path ?? '') as string;
      if (baseUrl) {
        return {
          url: baseUrl + path,
          method: (connectorConfig.method ?? bindingConfig?.method ?? 'POST') as string,
          timeout: (connectorConfig.timeout ?? 10000) as number,
          headers: connectorConfig.headers as Record<string, string> | undefined,
        };
      }
    }

    return null;
  }
}
