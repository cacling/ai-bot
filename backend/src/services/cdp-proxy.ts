/**
 * cdp-proxy.ts — CDP Service 反向代理
 *
 * 将 /api/cdp/customers、/api/cdp/tags 等路径代理到 cdp_service（端口 18020）。
 * 注入 staff 身份 header 供审计日志使用。
 */
import { Hono } from 'hono';

const CDP_SERVICE_URL = process.env.CDP_SERVICE_URL ?? `http://localhost:${process.env.CDP_SERVICE_PORT ?? 18020}`;

export const CDP_PROXY_PREFIXES = [
  '/api/cdp/customers',
  '/api/cdp/audit-logs',
  '/api/cdp/tags',
  '/api/cdp/blacklist',
  '/api/cdp/segments',
  '/api/cdp/lifecycle',
  '/api/cdp/tasks',
];

export async function proxyToCdp(c: import('hono').Context) {
  try {
    const url = new URL(c.req.url);
    const targetUrl = `${CDP_SERVICE_URL}${url.pathname}${url.search}`;
    const headers = new Headers(c.req.raw.headers);
    headers.delete('host');
    // 注入 Staff 身份 header（session 中间件已解析）
    const staffId = c.get('staffId') as string | undefined;
    if (staffId) {
      headers.set('X-Staff-Id', staffId);
      headers.set('X-Staff-Name', c.get('staffDisplayName') as string ?? '');
      headers.set('X-Staff-Role', c.get('staffRole') as string ?? '');
    }
    const res = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
      // @ts-expect-error duplex needed for streaming request body
      duplex: 'half',
    });
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } catch (e) {
    return c.json({ error: `cdp_service unreachable: ${String(e)}` }, 502);
  }
}

/**
 * 注册 CDP 代理路由到 Hono app
 */
export function mountCdpProxy(app: Hono) {
  for (const prefix of CDP_PROXY_PREFIXES) {
    app.all(prefix, proxyToCdp);
    app.all(`${prefix}/*`, proxyToCdp);
  }
}
