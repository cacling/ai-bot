/**
 * api-routes.test.ts — API tests for engagement, mock-social, and plugins routes.
 *
 * Uses the Hono app directly (no HTTP server needed).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initTestDb } from '../helpers/test-db';

const testDb = initTestDb('api-routes');

beforeAll(async () => { await testDb.pushSchema(); });
afterAll(() => testDb.cleanup());

const { createApp } = await import('../../src/server');
const { db, ixAgentPresence, ixEngagementItems } = await import('../../src/db');

const app = createApp();

// ── Helpers ──────────────────────────────────────────────────────────────

function req(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  return app.request(path, init);
}

// ── Mock Social Routes ────────────────────────────────────────────────────

describe('POST /api/mock-social/ingest', () => {
  beforeAll(async () => {
    // Seed agent for routing
    await db.insert(ixAgentPresence).values({
      agent_id: 'api-test-agent',
      presence_status: 'online',
      max_chat_slots: 10,
      max_voice_slots: 1,
      active_chat_count: 0,
      active_voice_count: 0,
    });
  });

  test('injects a single engagement item', async () => {
    const res = await req('POST', '/api/mock-social/ingest', {
      body: '测试消息',
      provider: 'mock',
      auto_triage: false,
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { item_id: string };
    expect(data.item_id).toBeDefined();
  });

  test('returns 400 when body is missing', async () => {
    const res = await req('POST', '/api/mock-social/ingest', {});
    expect(res.status).toBe(400);
  });

  test('auto-triage runs by default', async () => {
    const res = await req('POST', '/api/mock-social/ingest', {
      body: '我要投诉你们到315',
      sentiment: 'negative',
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { triage: { classification: string; recommendation: string } };
    expect(data.triage).toBeDefined();
    expect(data.triage.classification).toBe('crisis');
  });

  test('auto-triage + bridge for crisis item', async () => {
    const res = await req('POST', '/api/mock-social/ingest', {
      body: '涉嫌诈骗，我联系律师了',
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { triage: { recommendation: string }; bridge: { success: boolean } };
    expect(data.triage.recommendation).toBe('materialize');
    expect(data.bridge).toBeDefined();
    expect(data.bridge.success).toBe(true);
  });
});

describe('POST /api/mock-social/batch', () => {
  test('injects multiple items', async () => {
    const res = await req('POST', '/api/mock-social/batch', {
      items: [
        { body: '批量测试1' },
        { body: '批量测试2' },
        { body: '批量测试3' },
      ],
      auto_triage: false,
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { count: number; results: unknown[] };
    expect(data.count).toBe(3);
    expect(data.results.length).toBe(3);
  });

  test('returns 400 for empty items', async () => {
    const res = await req('POST', '/api/mock-social/batch', { items: [] });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/mock-social/scenario', () => {
  test('runs mixed scenario', async () => {
    const res = await req('POST', '/api/mock-social/scenario', { scenario: 'mixed' });
    expect(res.status).toBe(201);
    const data = await res.json() as { scenario: string; count: number; results: unknown[] };
    expect(data.scenario).toBe('mixed');
    expect(data.count).toBe(5);
  });

  test('runs crisis scenario', async () => {
    const res = await req('POST', '/api/mock-social/scenario', { scenario: 'crisis' });
    expect(res.status).toBe(201);
    const data = await res.json() as { count: number; results: Array<{ classification: string }> };
    expect(data.count).toBe(3);
  });

  test('unknown scenario falls back to mixed', async () => {
    const res = await req('POST', '/api/mock-social/scenario', { scenario: 'unknown' });
    expect(res.status).toBe(201);
    const data = await res.json() as { count: number };
    expect(data.count).toBe(5); // mixed has 5 items
  });
});

// ── Engagement Routes ─────────────────────────────────────────────────────

describe('GET /api/engagement/items', () => {
  test('lists engagement items', async () => {
    const res = await req('GET', '/api/engagement/items');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: unknown[] };
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
  });

  test('filters by status', async () => {
    const res = await req('GET', '/api/engagement/items?status=new');
    expect(res.status).toBe(200);
  });

  test('respects limit', async () => {
    const res = await req('GET', '/api/engagement/items?limit=2');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: unknown[] };
    expect(data.items.length).toBeLessThanOrEqual(2);
  });
});

describe('GET /api/engagement/items/:id', () => {
  test('returns item with triage and moderation', async () => {
    // Insert and triage an item first
    const ingestRes = await req('POST', '/api/mock-social/ingest', {
      body: '详情测试消息',
      auto_triage: true,
    });
    const { item_id } = await ingestRes.json() as { item_id: string };

    const res = await req('GET', `/api/engagement/items/${item_id}`);
    expect(res.status).toBe(200);
    const data = await res.json() as { item_id: string; triage_results: unknown[] };
    expect(data.item_id).toBe(item_id);
    expect(Array.isArray(data.triage_results)).toBe(true);
  });

  test('returns 404 for non-existent item', async () => {
    const res = await req('GET', '/api/engagement/items/non-existent');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/engagement/items/:id/moderate', () => {
  test('creates moderation action', async () => {
    const ingestRes = await req('POST', '/api/mock-social/ingest', {
      body: '需要审核的消息',
      auto_triage: false,
    });
    const { item_id } = await ingestRes.json() as { item_id: string };

    const res = await req('POST', `/api/engagement/items/${item_id}/moderate`, {
      action_type: 'reply',
      content: '感谢您的反馈',
      reason: '正面回复',
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { action_id: string };
    expect(data.action_id).toBeDefined();
  });

  test('returns 400 without action_type', async () => {
    const res = await req('POST', '/api/engagement/items/any-id/moderate', {});
    expect(res.status).toBe(400);
  });
});

// ── Plugin Routes ─────────────────────────────────────────────────────────

describe('plugin catalog CRUD', () => {
  let pluginId: string;

  test('POST /api/plugins/catalog — registers a plugin', async () => {
    const res = await req('POST', '/api/plugins/catalog', {
      name: 'api_test_scorer',
      display_name_zh: 'API测试评分器',
      display_name_en: 'API Test Scorer',
      plugin_type: 'candidate_scorer',
      handler_module: 'core_least_loaded',
      timeout_ms: 2000,
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { plugin_id: string };
    pluginId = data.plugin_id;
    expect(pluginId).toBeDefined();
  });

  test('GET /api/plugins/catalog — lists plugins', async () => {
    const res = await req('GET', '/api/plugins/catalog');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: Array<{ plugin_id: string }> };
    expect(data.items.some(p => p.plugin_id === pluginId)).toBe(true);
  });

  test('GET /api/plugins/catalog/:id — gets plugin detail', async () => {
    const res = await req('GET', `/api/plugins/catalog/${pluginId}`);
    expect(res.status).toBe(200);
    const data = await res.json() as { plugin_id: string; bindings: unknown[] };
    expect(data.plugin_id).toBe(pluginId);
    expect(Array.isArray(data.bindings)).toBe(true);
  });

  test('PUT /api/plugins/catalog/:id — updates a plugin', async () => {
    const res = await req('PUT', `/api/plugins/catalog/${pluginId}`, {
      description: 'Updated description',
      timeout_ms: 5000,
    });
    expect(res.status).toBe(200);
  });

  test('DELETE /api/plugins/catalog/:id — disables a plugin', async () => {
    const res = await req('DELETE', `/api/plugins/catalog/${pluginId}`);
    expect(res.status).toBe(200);

    // Verify disabled
    const checkRes = await req('GET', `/api/plugins/catalog/${pluginId}`);
    const data = await checkRes.json() as { status: string };
    expect(data.status).toBe('disabled');
  });

  test('POST returns 400 with missing fields', async () => {
    const res = await req('POST', '/api/plugins/catalog', { name: 'incomplete' });
    expect(res.status).toBe(400);
  });
});

describe('plugin binding CRUD', () => {
  let bindingId: string;
  const testPluginId = 'api-binding-test-plugin';

  beforeAll(async () => {
    // Seed a plugin for binding tests
    await req('POST', '/api/plugins/catalog', {
      name: 'binding_test_scorer',
      display_name_zh: '绑定测试',
      display_name_en: 'Binding Test',
      plugin_type: 'candidate_scorer',
      handler_module: 'core_least_loaded',
    });
  });

  test('POST /api/plugins/bindings — creates binding', async () => {
    // Get the plugin ID from catalog
    const listRes = await req('GET', '/api/plugins/catalog?type=candidate_scorer');
    const plugins = (await listRes.json() as { items: Array<{ plugin_id: string; name: string }> }).items;
    const plugin = plugins.find(p => p.name === 'binding_test_scorer');

    const res = await req('POST', '/api/plugins/bindings', {
      queue_code: 'default_chat',
      plugin_id: plugin!.plugin_id,
      slot: 'candidate_scorer',
      priority_order: 10,
      shadow_mode: true,
    });
    expect(res.status).toBe(201);
    bindingId = (await res.json() as { binding_id: string }).binding_id;
  });

  test('GET /api/plugins/bindings — lists bindings', async () => {
    const res = await req('GET', '/api/plugins/bindings?queue_code=default_chat');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: unknown[] };
    expect(data.items.length).toBeGreaterThan(0);
  });

  test('PUT /api/plugins/bindings/:id — updates binding', async () => {
    const res = await req('PUT', `/api/plugins/bindings/${bindingId}`, {
      shadow_mode: false,
      priority_order: 5,
    });
    expect(res.status).toBe(200);
  });

  test('DELETE /api/plugins/bindings/:id — removes binding', async () => {
    const res = await req('DELETE', `/api/plugins/bindings/${bindingId}`);
    expect(res.status).toBe(200);
  });

  test('POST returns 400 with missing fields', async () => {
    const res = await req('POST', '/api/plugins/bindings', { queue_code: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('plugin execution logs', () => {
  test('GET /api/plugins/logs — lists logs', async () => {
    const res = await req('GET', '/api/plugins/logs');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: unknown[] };
    expect(Array.isArray(data.items)).toBe(true);
  });
});

describe('replay API', () => {
  test('POST /api/plugins/replay — returns 400 without interaction_id', async () => {
    const res = await req('POST', '/api/plugins/replay', {});
    expect(res.status).toBe(400);
  });

  test('POST /api/plugins/replay/batch — returns 400 without interaction_ids', async () => {
    const res = await req('POST', '/api/plugins/replay/batch', {});
    expect(res.status).toBe(400);
  });

  test('POST /api/plugins/replay/batch — rejects > 100 items', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    const res = await req('POST', '/api/plugins/replay/batch', { interaction_ids: ids });
    expect(res.status).toBe(400);
  });
});

// ── Health Check ──────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('returns service health', async () => {
    const res = await req('GET', '/health');
    expect(res.status).toBe(200);
    const data = await res.json() as { status: string; modules: string[] };
    expect(data.status).toBe('ok');
    expect(data.modules).toContain('plugins');
    expect(data.modules).toContain('engagement');
    expect(data.modules).toContain('mock-social');
  });
});
