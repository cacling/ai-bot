/**
 * km-proxy.ts — KM Service 反向代理
 *
 * 将 /api/skills、/api/mcp 等路径代理到 km_service（端口 18010）。
 * 生产环境前端直连 km_service，此代理仅用于开发/测试便利。
 */
import { Hono } from 'hono';

const KM_SERVICE_URL = process.env.KM_SERVICE_URL ?? `http://localhost:${process.env.KM_SERVICE_PORT ?? 18010}`;

export const KM_PROXY_PREFIXES = [
  '/api/km/', '/api/mcp/', '/api/files/', '/api/skills/', '/api/skill-versions/',
  '/api/canary/', '/api/change-requests/',
  '/api/test-cases/', '/api/skill-creator/',
];

export async function proxyToKm(c: import('hono').Context) {
  try {
    const url = new URL(c.req.url);
    const targetUrl = `${KM_SERVICE_URL}${url.pathname}${url.search}`;
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
    return c.json({ error: `km_service unreachable: ${String(e)}` }, 502);
  }
}

/**
 * 注册 KM 代理路由到 Hono app
 * 每个前缀同时注册精确根路径和通配子路径
 */
export function mountKmProxy(app: Hono) {
  for (const prefix of KM_PROXY_PREFIXES) {
    const root = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    app.all(root, proxyToKm);
    app.all(`${root}/*`, proxyToKm);
  }
}
