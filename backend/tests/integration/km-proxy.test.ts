/**
 * km-proxy.test.ts — Backend KM 反向代理路由集成测试
 *
 * 直接导入生产代码 (km-proxy.ts) 进行测试，
 * 确保 index.ts 使用的路由注册逻辑被覆盖。
 * 使用 mock fetch 拦截出站请求，不依赖真实 km_service。
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Hono } from 'hono';
import { KM_PROXY_PREFIXES, mountKmProxy } from '../../src/services/km-proxy';

// ── mock fetch：拦截 proxyToKm 发出的请求 ─────────────────────────────────────

const originalFetch = globalThis.fetch;

function installMockFetch() {
  const fn = mock((url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    return Promise.resolve(new Response(
      JSON.stringify({ proxied: true, url: urlStr }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
  });
  globalThis.fetch = fn as any;
  return fn;
}

describe('KM proxy routes (real mountKmProxy)', () => {
  let app: Hono;

  beforeEach(() => {
    installMockFetch();
    app = new Hono();
    mountKmProxy(app);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
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
    expect(body.url).toContain('/api/skills/telecom-app/files');
  });

  test('GET /api/mcp/tools（根路径）正确代理', async () => {
    const res = await app.request('/api/mcp/tools');
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.url).toContain('/api/mcp/tools');
  });

  test('GET /api/mcp/tools/query_subscriber（子路径）正确代理', async () => {
    const res = await app.request('/api/mcp/tools/query_subscriber');
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.url).toContain('/api/mcp/tools/query_subscriber');
  });

  test('带 query string 正确转发', async () => {
    const res = await app.request('/api/skills?status=active&page=1');
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.url).toContain('?status=active&page=1');
  });

  test('POST 请求正确代理', async () => {
    const res = await app.request('/api/km/reply-copilot/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test' }),
    });
    expect(res.status).toBe(200);
  });

  test('所有前缀的根路径都能匹配', async () => {
    const roots = KM_PROXY_PREFIXES.map(p => p.endsWith('/') ? p.slice(0, -1) : p);
    for (const root of roots) {
      const res = await app.request(root);
      expect(res.status).toBe(200);
    }
  });

  test('km_service 不可达返回 502', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as any;
    const res = await app.request('/api/skills');
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('km_service unreachable');
  });
});
