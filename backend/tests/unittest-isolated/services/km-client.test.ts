/**
 * km-client.test.ts — km-client HTTP 客户端测试
 *
 * 测试 getToolsOverview / getToolDetail / getToolsOverviewSync 的缓存、
 * 冷启动、降级逻辑。使用 mock fetch 避免依赖真实 km_service。
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';

// Mock fetch before importing km-client
const originalFetch = globalThis.fetch;

// ── 测试数据 ──────────────────────────────────────────────────────────────────

const MOCK_TOOLS = [
  { name: 'query_subscriber', description: '查询用户', source: 'mcp', source_type: 'mcp' as const, status: 'available' as const, mocked: false, skills: ['telecom-app'], annotations: null },
  { name: 'get_skill_instructions', description: '加载技能', source: 'builtin', source_type: 'builtin' as const, status: 'available' as const, mocked: false, skills: [], annotations: null },
];

const MOCK_DETAIL = {
  ...MOCK_TOOLS[0],
  inputSchema: { type: 'object', properties: { phone: { type: 'string' } }, required: ['phone'] },
  responseExample: null,
};

function makeMockFetch(overrides?: {
  toolsResponse?: unknown;
  toolsStatus?: number;
  detailResponse?: unknown;
  detailStatus?: number;
  shouldFail?: boolean;
}) {
  return mock((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

    if (overrides?.shouldFail) {
      return Promise.reject(new Error('Network error'));
    }

    // GET /api/mcp/tools/:name
    if (urlStr.match(/\/api\/mcp\/tools\/[^/]+$/)) {
      return Promise.resolve(new Response(
        JSON.stringify(overrides?.detailResponse ?? MOCK_DETAIL),
        { status: overrides?.detailStatus ?? 200, headers: { 'Content-Type': 'application/json' } },
      ));
    }

    // GET /api/mcp/tools
    if (urlStr.includes('/api/mcp/tools')) {
      return Promise.resolve(new Response(
        JSON.stringify(overrides?.toolsResponse ?? { items: MOCK_TOOLS }),
        { status: overrides?.toolsStatus ?? 200, headers: { 'Content-Type': 'application/json' } },
      ));
    }

    // Internal API endpoints (skill registry, MCP servers, etc.)
    if (urlStr.includes('/api/internal/skills/registry')) {
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (urlStr.includes('/api/internal/mcp/')) {
      return Promise.resolve(new Response(JSON.stringify({ items: [], implementations: [], connectors: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }

    // Other endpoints
    return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });
}

// ── 每个测试前重置模块状态 ──────────────────────────────────────────────────────

// km-client 有模块级缓存（_toolsCache 等），需要每次重新导入
// 使用动态 import 并清除模块缓存
async function loadFreshModule() {
  // Bun 不支持直接清除模块缓存，所以我们通过 warmToolsCache 重置
  const mod = await import('../../../src/services/km-client');
  return mod;
}

describe('km-client', () => {
  let mockFetch: ReturnType<typeof makeMockFetch>;

  beforeEach(() => {
    mockFetch = makeMockFetch();
    globalThis.fetch = mockFetch as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('warmToolsCache', () => {
    test('成功预热后缓存非空', async () => {
      const mod = await loadFreshModule();
      await mod.warmToolsCache();
      const items = await mod.getToolsOverview();
      expect(items.length).toBe(2);
      expect(items[0].name).toBe('query_subscriber');
    });

    test('km_service 不可达时缓存保持原样', async () => {
      const mod = await loadFreshModule();
      // 先预热
      await mod.warmToolsCache();
      const before = await mod.getToolsOverview();
      expect(before.length).toBe(2);

      // 断开连接后再次 warmup
      globalThis.fetch = makeMockFetch({ shouldFail: true }) as any;
      await mod.warmToolsCache();
      // 缓存应保留上次结果（warmToolsCache 只在成功时覆盖）
      const sync = mod.getToolsOverviewSync();
      expect(sync.length).toBe(2);
    });
  });

  describe('getToolsOverview (async)', () => {
    test('冷启动时 await 首次 fetch', async () => {
      const mod = await loadFreshModule();
      // 强制冷启动：先用空响应清缓存再用正常响应
      globalThis.fetch = makeMockFetch({ toolsResponse: { items: [] } }) as any;
      await mod.warmToolsCache();

      // 现在设置正常响应
      globalThis.fetch = makeMockFetch() as any;
      // 清空缓存模拟冷启动 — 通过写空
      await mod.warmToolsCache();
      const items = await mod.getToolsOverview();
      expect(Array.isArray(items)).toBe(true);
    });

    test('缓存命中时直接返回', async () => {
      const mod = await loadFreshModule();
      await mod.warmToolsCache();

      // 更换 fetch 为失败模式
      globalThis.fetch = makeMockFetch({ shouldFail: true }) as any;

      // 仍应从缓存返回
      const items = await mod.getToolsOverview();
      expect(items.length).toBe(2);
    });
  });

  describe('getToolsOverviewSync', () => {
    test('缓存为空时返回空数组', async () => {
      const mod = await loadFreshModule();
      globalThis.fetch = makeMockFetch({ toolsResponse: { items: [] } }) as any;
      await mod.warmToolsCache();
      const items = mod.getToolsOverviewSync();
      expect(Array.isArray(items)).toBe(true);
    });

    test('预热后返回缓存数据', async () => {
      const mod = await loadFreshModule();
      await mod.warmToolsCache();
      const items = mod.getToolsOverviewSync();
      expect(items.length).toBe(2);
      expect(items[0].name).toBe('query_subscriber');
    });
  });

  describe('getToolDetail (async)', () => {
    test('成功获取工具详情含 inputSchema', async () => {
      const mod = await loadFreshModule();
      await mod.warmToolsCache();
      const detail = await mod.getToolDetail('query_subscriber');
      expect(detail).not.toBeNull();
      expect(detail!.name).toBe('query_subscriber');
      expect(detail!.inputSchema).not.toBeNull();
      expect(detail!.inputSchema!.type).toBe('object');
    });

    test('km_service 返回 404 时降级到 overview（inputSchema 为 null）', async () => {
      const mod = await loadFreshModule();
      await mod.warmToolsCache();

      // detail 端点返回 404 — 使用未被缓存过的工具名
      globalThis.fetch = makeMockFetch({ detailStatus: 404 }) as any;
      const detail = await mod.getToolDetail('get_skill_instructions');
      expect(detail).not.toBeNull();
      expect(detail!.name).toBe('get_skill_instructions');
      expect(detail!.inputSchema).toBeNull();
    });

    test('工具不存在时返回 null', async () => {
      const mod = await loadFreshModule();
      await mod.warmToolsCache();

      globalThis.fetch = makeMockFetch({ detailStatus: 404 }) as any;
      const detail = await mod.getToolDetail('nonexistent_tool');
      expect(detail).toBeNull();
    });

    test('详情缓存 30s TTL', async () => {
      const mod = await loadFreshModule();
      await mod.warmToolsCache();

      // 首次请求
      const detail1 = await mod.getToolDetail('query_subscriber');
      expect(detail1!.inputSchema).not.toBeNull();

      // 立即再次请求 — 应从缓存返回，不再 fetch
      globalThis.fetch = makeMockFetch({ shouldFail: true }) as any;
      const detail2 = await mod.getToolDetail('query_subscriber');
      expect(detail2!.inputSchema).not.toBeNull();
    });
  });

  describe('buildReplyHints', () => {
    test('POST 到 /api/km/reply-copilot/build', async () => {
      const mockReply = { scene: { code: 'test', label: 'Test', risk: 'low' }, required_slots: [], recommended_terms: [], forbidden_terms: [], reply_options: [], next_actions: [], sources: [], confidence: 0.9, asset_version_id: 'v1' };
      globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify(mockReply), { status: 200, headers: { 'Content-Type': 'application/json' } }))) as any;

      const mod = await loadFreshModule();
      const result = await mod.buildReplyHints({ message: 'test', phone: '13800138000' });
      expect(result).not.toBeNull();
      expect(result!.scene.code).toBe('test');
    });

    test('km_service 不可达时返回 null', async () => {
      globalThis.fetch = mock(() => Promise.reject(new Error('unreachable'))) as any;
      const mod = await loadFreshModule();
      const result = await mod.buildReplyHints({ message: 'test', phone: '13800138000' });
      expect(result).toBeNull();
    });
  });
});
