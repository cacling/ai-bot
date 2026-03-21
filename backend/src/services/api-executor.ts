/**
 * api-executor.ts — API Binding 工具执行器
 *
 * 读取 mcp_tools.execution_config 中的 API 配置，
 * 发送 HTTP 请求到外部 API 端点，返回结果。
 */
import { logger } from './logger';

export interface ApiExecutionConfig {
  url: string;
  method?: string;   // 默认 POST
  timeout?: number;  // 默认 10000ms
  headers?: Record<string, string>;
}

export async function executeApiTool(
  config: ApiExecutionConfig,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { url, method = 'POST', timeout = 10000, headers = {} } = config;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: method !== 'GET' ? JSON.stringify(args) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      logger.error('api-executor', 'http_error', { url, status: res.status });
      return { success: false, message: `API 请求失败: HTTP ${res.status}` };
    }

    const data = await res.json();
    return data;
  } catch (err) {
    logger.error('api-executor', 'request_error', { url, error: String(err) });
    return { success: false, message: `API 请求异常: ${String(err)}` };
  }
}
