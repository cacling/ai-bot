/**
 * work-order-proxy.test.ts — Backend Work Order 反向代理路由集成测试
 *
 * 直接导入生产代码 (work-order-proxy.ts) 进行测试，
 * 确保 index.ts 使用的路由注册逻辑被覆盖。
 * 使用 mock fetch 拦截出站请求，不依赖真实 wo_service。
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Hono } from 'hono';
import { WO_PROXY_PREFIXES, mountWorkOrderProxy } from '../../src/services/work-order-proxy';

// ── mock fetch：拦截 proxyToWo 发出的请求 ─────────────────────────────────────

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

describe('Work Order proxy routes (real mountWorkOrderProxy)', () => {
  let app: Hono;

  beforeEach(() => {
    installMockFetch();
    app = new Hono();
    mountWorkOrderProxy(app);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('GET /api/work-items（根路径）正确代理', async () => {
    const res = await app.request('/api/work-items');
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.proxied).toBe(true);
    expect(body.url).toContain('/api/work-items');
  });

  test('GET /api/work-items/WO001（子路径）正确代理', async () => {
    const res = await app.request('/api/work-items/WO001');
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.proxied).toBe(true);
    expect(body.url).toContain('/api/work-items/WO001');
  });

  test('GET /api/issue-threads/thrd_001（深层子路径）正确代理', async () => {
    const res = await app.request('/api/issue-threads/thrd_001');
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.url).toContain('/api/issue-threads/thrd_001');
  });

  test('GET /api/intakes（根路径）正确代理', async () => {
    const res = await app.request('/api/intakes');
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.url).toContain('/api/intakes');
  });

  test('带 query string 正确转发', async () => {
    const res = await app.request('/api/work-items?status=open&page=1');
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.url).toContain('?status=open&page=1');
  });

  test('POST 请求正确代理', async () => {
    const res = await app.request('/api/work-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'test work item' }),
    });
    expect(res.status).toBe(200);
  });

  test('所有前缀的根路径都能匹配', async () => {
    const roots = WO_PROXY_PREFIXES.map(p => p.endsWith('/') ? p.slice(0, -1) : p);
    for (const root of roots) {
      const res = await app.request(root);
      expect(res.status).toBe(200);
    }
  });

  test('wo_service 不可达返回 502', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as any;
    const res = await app.request('/api/work-items');
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('wo_service unreachable');
  });
});
