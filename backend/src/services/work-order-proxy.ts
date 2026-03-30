/**
 * work-order-proxy.ts — Work Order Service 反向代理
 *
 * 将 /api/work-items、/api/work-orders 等路径代理到 work order service。
 * 生产环境前端直连 work order service，此代理仅用于开发/测试便利。
 */
import { Hono } from 'hono';

const WO_SERVICE_URL = process.env.WO_SERVICE_URL ?? `http://localhost:${process.env.WORK_ORDER_PORT ?? 18009}`;

export const WO_PROXY_PREFIXES = [
  '/api/work-items/', '/api/work-orders/', '/api/appointments/',
  '/api/templates/', '/api/tickets/', '/api/tasks/',
  '/api/workflows/', '/api/categories/',
  '/api/intakes/', '/api/drafts/',
  '/api/issue-threads/', '/api/merge-reviews/',
];

export async function proxyToWo(c: import('hono').Context) {
  try {
    const url = new URL(c.req.url);
    const targetUrl = `${WO_SERVICE_URL}${url.pathname}${url.search}`;
    const headers = new Headers(c.req.raw.headers);
    headers.delete('host');
    // 注入 Staff 身份 header（session 中间件已解析）
    const staffId = c.get('staffId') as string | undefined;
    if (staffId) {
      headers.set('X-Staff-Id', staffId);
      headers.set('X-Staff-Role', c.get('staffRole') as string);
      headers.set('X-User-Id', staffId);
      headers.set('X-User-Role', c.get('platformRole') as string);
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
    return c.json({ error: `wo_service unreachable: ${String(e)}` }, 502);
  }
}

/**
 * 注册 Work Order 代理路由到 Hono app
 * 每个前缀同时注册精确根路径和通配子路径
 */
export function mountWorkOrderProxy(app: Hono) {
  for (const prefix of WO_PROXY_PREFIXES) {
    const root = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    app.all(root, proxyToWo);
    app.all(`${root}/*`, proxyToWo);
  }
}
