/**
 * wfm-proxy.ts — WFM Service 反向代理
 *
 * 将 /api/wfm/* 路径代理到 wfm_service（端口 18023）。
 * 注入 staff 身份 header 供审计日志使用。
 */
import { Hono } from 'hono';

const WFM_SERVICE_URL = process.env.WFM_SERVICE_URL ?? `http://localhost:${process.env.WFM_SERVICE_PORT ?? 18023}`;

export const WFM_PROXY_PREFIXES = [
  '/api/wfm/activities',
  '/api/wfm/shifts',
  '/api/wfm/contracts',
  '/api/wfm/groups',
  '/api/wfm/staff-skills',
  '/api/wfm/leaves',
  '/api/wfm/plans',
  '/api/wfm/staffing',
  '/api/wfm/rules',
];

export async function proxyToWfm(c: import('hono').Context) {
  try {
    const url = new URL(c.req.url);
    const targetUrl = `${WFM_SERVICE_URL}${url.pathname}${url.search}`;
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
    return c.json({ error: `wfm_service unreachable: ${String(e)}` }, 502);
  }
}

/**
 * 注册 WFM 代理路由到 Hono app
 */
export function mountWfmProxy(app: Hono) {
  for (const prefix of WFM_PROXY_PREFIXES) {
    app.all(prefix, proxyToWfm);
    app.all(`${prefix}/*`, proxyToWfm);
  }
}
