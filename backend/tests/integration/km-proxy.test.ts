/**
 * km-proxy.test.ts — Backend KM 反向代理路由测试
 *
 * 验证 /api/skills、/api/mcp/tools 等路径能正确代理到 km_service。
 * 使用 mock fetch 拦截出站请求。
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Hono } from 'hono';

// ── 构建最小 app 复现 proxy 逻辑 ──────────────────────────────────────────────

const KM_SERVICE_URL = 'http://localhost:18010';

const KM_PROXY_PREFIXES = [
  '/api/km/', '/api/mcp/', '/api/files/', '/api/skills/', '/api/skill-versions/',
  '/api/sandbox/', '/api/skill-edit/', '/api/canary/', '/api/change-requests/',
  '/api/test-cases/', '/api/skill-creator/',
];

function buildTestApp(mockFetchFn: typeof fetch) {
  const app = new Hono();

  async function proxyToKm(c: import('hono').Context) {
    try {
      const url = new URL(c.req.url);
      const targetUrl = `${KM_SERVICE_URL}${url.pathname}${url.search}`;
      const headers = new Headers(c.req.raw.headers);
      headers.delete('host');
      const res = await mockFetchFn(targetUrl, {
        method: c.req.method,
        headers,
        body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
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

  // 复现 index.ts 中的路由注册逻辑（含 root path 修复）
  for (const prefix of KM_PROXY_PREFIXES) {
    const root = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    app.all(root, proxyToKm);
    app.all(`${root}/*`, proxyToKm);
  }

  return app;
}

describe('KM proxy routes', () => {
  let proxyFetch: ReturnType<typeof mock>;
  let app: Hono;

  beforeEach(() => {
    proxyFetch = mock((url: string | URL | Request) => {
      return Promise.resolve(new Response(
        JSON.stringify({ proxied: true, url: typeof url === 'string' ? url : '' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ));
    });
    app = buildTestApp(proxyFetch as any);
  });

  test('GET /api/skills（根路径）正确代理', async () => {
    const res = await app.request('/api/skills');
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.proxied).toBe(true);
    expect(body.url).toContain('/api/skills');
  });

  test('GET /api/skills/telecom-app（子路径）正确代理', async () => {
    const res = await app.request('/api/skills/telecom-app');
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.proxied).toBe(true);
    expect(body.url).toContain('/api/skills/telecom-app');
  });

  test('GET /api/skills/telecom-app/files（深层子路径）正确代理', async () => {
    const res = await app.request('/api/skills/telecom-app/files');
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.proxied).toBe(true);
    expect(body.url).toContain('/api/skills/telecom-app/files');
  });

  test('GET /api/mcp/tools（根路径）正确代理', async () => {
    const res = await app.request('/api/mcp/tools');
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.proxied).toBe(true);
    expect(body.url).toContain('/api/mcp/tools');
  });

  test('GET /api/mcp/tools/query_subscriber（子路径）正确代理', async () => {
    const res = await app.request('/api/mcp/tools/query_subscriber');
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.proxied).toBe(true);
    expect(body.url).toContain('/api/mcp/tools/query_subscriber');
  });

  test('带 query string 正确转发', async () => {
    const res = await app.request('/api/skills?status=active&page=1');
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.url).toContain('?status=active&page=1');
  });

  test('POST 请求正确代理方法', async () => {
    const res = await app.request('/api/km/reply-copilot/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test' }),
    });
    expect(res.status).toBe(200);
    expect(proxyFetch).toHaveBeenCalled();
  });

  test('所有前缀的根路径都能匹配', async () => {
    const roots = KM_PROXY_PREFIXES.map(p => p.endsWith('/') ? p.slice(0, -1) : p);
    for (const root of roots) {
      const res = await app.request(root);
      expect(res.status).toBe(200);
    }
  });

  test('km_service 不可达返回 502', async () => {
    const failApp = buildTestApp((() => Promise.reject(new Error('ECONNREFUSED'))) as any);
    const res = await failApp.request('/api/skills');
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('km_service unreachable');
  });
});
