/**
 * outbound-proxy.ts — Outbound Service 反向代理
 *
 * 将 /api/outbound/campaigns、/api/outbound/tasks 等路径代理到 outbound_service（端口 18021）。
 * 注入 staff 身份 header 供审计日志使用。
 */
import { Hono } from 'hono';

const OB_SERVICE_URL = process.env.OUTBOUND_SERVICE_URL
  ?? `http://localhost:${process.env.OUTBOUND_SERVICE_PORT ?? 18021}`;

export const OB_PROXY_PREFIXES = [
  '/api/outbound/campaigns',
  '/api/outbound/tasks',
  '/api/outbound/results',
  '/api/outbound/dashboard',
];

export async function proxyToOutbound(c: import('hono').Context) {
  try {
    const url = new URL(c.req.url);
    const targetUrl = `${OB_SERVICE_URL}${url.pathname}${url.search}`;
    const headers = new Headers(c.req.raw.headers);
    headers.delete('host');
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
    return c.json({ error: `outbound_service unreachable: ${String(e)}` }, 502);
  }
}

/**
 * 注册 Outbound 代理路由到 Hono app
 */
export function mountOutboundProxy(app: Hono) {
  for (const prefix of OB_PROXY_PREFIXES) {
    app.all(prefix, proxyToOutbound);
    app.all(`${prefix}/*`, proxyToOutbound);
  }
}
