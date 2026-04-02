/**
 * routing-mgmt.test.ts — API tests for routing management endpoints.
 *
 * Uses Hono app.request() — no HTTP server needed.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initTestDb } from '../helpers/test-db';

const testDb = initTestDb('routing-mgmt');

beforeAll(async () => { await testDb.pushSchema(); });
afterAll(() => testDb.cleanup());

const { createApp } = await import('../../src/server');
const { db, ixRoutingQueues, ixInteractions, ixInteractionEvents, ixAgentPresence, ixRouteRules, ixRouteOperationAudit, eq } = await import('../../src/db');

const app = createApp();

function req(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  return app.request(path, init);
}

// ── Seed test data ───────────────────────────────────────────────────────

beforeAll(async () => {
  // Queue
  await db.insert(ixRoutingQueues).values({
    queue_code: 'mgmt-test-queue',
    display_name_zh: '管理测试队列',
    display_name_en: 'Mgmt Test Queue',
    work_model: 'live_chat',
    priority: 50,
    max_wait_seconds: 300,
  }).catch(() => {});

  // Agent
  await db.insert(ixAgentPresence).values({
    agent_id: 'mgmt-test-agent',
    presence_status: 'online',
    max_chat_slots: 5,
    max_voice_slots: 1,
    queue_codes_json: JSON.stringify(['mgmt-test-queue']),
  }).catch(() => {});

  // Interaction for monitor tests
  const { ixConversations } = await import('../../src/db');
  await db.insert(ixConversations).values({
    conversation_id: 'conv-mgmt-test',
    channel: 'web_chat',
  }).catch(() => {});

  await db.insert(ixInteractions).values({
    interaction_id: 'ix-mgmt-queued',
    conversation_id: 'conv-mgmt-test',
    work_model: 'live_chat',
    queue_code: 'mgmt-test-queue',
    priority: 50,
    state: 'queued',
    source_object_type: 'conversation',
    source_object_id: 'conv-mgmt-test',
  }).catch(() => {});

  await db.insert(ixInteractions).values({
    interaction_id: 'ix-mgmt-active',
    conversation_id: 'conv-mgmt-test',
    work_model: 'live_chat',
    queue_code: 'mgmt-test-queue',
    priority: 50,
    state: 'active',
    assigned_agent_id: 'mgmt-test-agent',
    source_object_type: 'conversation',
    source_object_id: 'conv-mgmt-test',
  }).catch(() => {});
});

// ══════════════════════════════════════════════════════════════════════════
// Stats endpoints
// ══════════════════════════════════════════════════════════════════════════

describe('GET /api/routing/stats/summary', () => {
  test('returns summary metrics', async () => {
    const res = await req('GET', '/api/routing/stats/summary');
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.total_today).toBeDefined();
    expect(typeof data.success_rate).toBe('number');
    expect(typeof data.avg_wait_seconds).toBe('number');
    expect(typeof data.overflow_count).toBe('number');
    expect(typeof data.current_queued).toBe('number');
  });
});

describe('GET /api/routing/stats/queue-load', () => {
  test('returns per-queue load', async () => {
    const res = await req('GET', '/api/routing/stats/queue-load');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: Array<{ queue_code: string; pending: number }> };
    expect(Array.isArray(data.items)).toBe(true);
    const testQueue = data.items.find(q => q.queue_code === 'mgmt-test-queue');
    expect(testQueue).toBeDefined();
  });
});

describe('GET /api/routing/stats/agent-capacity', () => {
  test('returns agent capacity', async () => {
    const res = await req('GET', '/api/routing/stats/agent-capacity');
    expect(res.status).toBe(200);
    const data = await res.json() as { online_count: number; agents: Array<{ agent_id: string }> };
    expect(typeof data.online_count).toBe('number');
    expect(Array.isArray(data.agents)).toBe(true);
  });
});

describe('GET /api/routing/stats/slow-routing', () => {
  test('returns slow routing list', async () => {
    const res = await req('GET', '/api/routing/stats/slow-routing?limit=5');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: unknown[] };
    expect(Array.isArray(data.items)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Rules CRUD
// ══════════════════════════════════════════════════════════════════════════

describe('route rules CRUD', () => {
  let ruleId: string;

  test('POST /api/routing/rules — creates a rule', async () => {
    const res = await req('POST', '/api/routing/rules', {
      rule_name: 'api_test_rule',
      rule_type: 'condition_match',
      queue_code: 'mgmt-test-queue',
      condition_json: JSON.stringify({ work_model: 'live_chat' }),
      priority_order: 10,
      grayscale_pct: 50,
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { rule_id: string; rule_name: string };
    ruleId = data.rule_id;
    expect(data.rule_name).toBe('api_test_rule');
  });

  test('POST returns 400 without required fields', async () => {
    const res = await req('POST', '/api/routing/rules', { rule_name: 'incomplete' });
    expect(res.status).toBe(400);
  });

  test('GET /api/routing/rules — lists rules', async () => {
    const res = await req('GET', '/api/routing/rules');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: Array<{ rule_id: string }> };
    expect(data.items.some(r => r.rule_id === ruleId)).toBe(true);
  });

  test('GET /api/routing/rules?queue_code= — filters by queue', async () => {
    const res = await req('GET', '/api/routing/rules?queue_code=mgmt-test-queue');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: Array<{ queue_code: string }> };
    expect(data.items.every(r => r.queue_code === 'mgmt-test-queue')).toBe(true);
  });

  test('GET /api/routing/rules/:id — gets rule detail', async () => {
    const res = await req('GET', `/api/routing/rules/${ruleId}`);
    expect(res.status).toBe(200);
    const data = await res.json() as { rule_id: string };
    expect(data.rule_id).toBe(ruleId);
  });

  test('GET /api/routing/rules/:id — 404 for non-existent', async () => {
    const res = await req('GET', '/api/routing/rules/non-existent-id');
    expect(res.status).toBe(404);
  });

  test('PUT /api/routing/rules/:id — updates a rule', async () => {
    const res = await req('PUT', `/api/routing/rules/${ruleId}`, {
      rule_name: 'api_test_rule_updated',
      grayscale_pct: 80,
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { rule_name: string; grayscale_pct: number };
    expect(data.rule_name).toBe('api_test_rule_updated');
    expect(data.grayscale_pct).toBe(80);
  });

  test('PUT returns 404 for non-existent rule', async () => {
    const res = await req('PUT', '/api/routing/rules/non-existent-id', { rule_name: 'x' });
    expect(res.status).toBe(404);
  });

  test('PUT /api/routing/rules/:id/toggle — toggles enabled', async () => {
    const res = await req('PUT', `/api/routing/rules/${ruleId}/toggle`, { enabled: false });
    expect(res.status).toBe(200);

    // Verify disabled
    const detail = await req('GET', `/api/routing/rules/${ruleId}`);
    const data = await detail.json() as { enabled: boolean };
    expect(data.enabled).toBe(false);
  });

  test('PUT toggle returns 404 for non-existent rule', async () => {
    const res = await req('PUT', '/api/routing/rules/non-existent-id/toggle', { enabled: true });
    expect(res.status).toBe(404);
  });

  test('POST /api/routing/rules/reorder — batch reorder', async () => {
    const res = await req('POST', '/api/routing/rules/reorder', {
      order: [{ rule_id: ruleId, priority_order: 99 }],
    });
    expect(res.status).toBe(200);

    const detail = await req('GET', `/api/routing/rules/${ruleId}`);
    const data = await detail.json() as { priority_order: number };
    expect(data.priority_order).toBe(99);
  });

  test('POST reorder returns 400 without order', async () => {
    const res = await req('POST', '/api/routing/rules/reorder', {});
    expect(res.status).toBe(400);
  });

  test('DELETE /api/routing/rules/:id — soft-disables rule', async () => {
    const res = await req('DELETE', `/api/routing/rules/${ruleId}`);
    expect(res.status).toBe(200);

    const detail = await req('GET', `/api/routing/rules/${ruleId}`);
    const data = await detail.json() as { enabled: boolean };
    expect(data.enabled).toBe(false);
  });

  test('DELETE returns 404 for non-existent rule', async () => {
    const res = await req('DELETE', '/api/routing/rules/non-existent-id');
    expect(res.status).toBe(404);
  });

  test('rule CRUD creates audit entries', async () => {
    const res = await req('GET', `/api/routing/audit?target_id=${ruleId}`);
    expect(res.status).toBe(200);
    const data = await res.json() as { items: Array<{ operation_type: string }> };
    const types = data.items.map(a => a.operation_type);
    expect(types).toContain('rule_create');
    expect(types).toContain('rule_update');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Monitor endpoints
// ══════════════════════════════════════════════════════════════════════════

describe('GET /api/routing/monitor/live', () => {
  test('returns live interactions', async () => {
    const res = await req('GET', '/api/routing/monitor/live');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: Array<{ interaction_id: string; wait_seconds: number }> };
    expect(Array.isArray(data.items)).toBe(true);
    // Our seeded queued interaction should appear
    const queued = data.items.find(i => i.interaction_id === 'ix-mgmt-queued');
    expect(queued).toBeDefined();
    expect(typeof queued!.wait_seconds).toBe('number');
  });

  test('filters by queue_code', async () => {
    const res = await req('GET', '/api/routing/monitor/live?queue_code=mgmt-test-queue');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: Array<{ interaction_id: string }> };
    const found = data.items.find(i => i.interaction_id === 'ix-mgmt-queued');
    expect(found).toBeDefined();
  });
});

describe('POST /api/routing/monitor/reassign/:id', () => {
  test('returns 400 without queue_code', async () => {
    const res = await req('POST', '/api/routing/monitor/reassign/ix-mgmt-queued', {});
    expect(res.status).toBe(400);
  });

  test('returns 404 for non-existent interaction', async () => {
    const res = await req('POST', '/api/routing/monitor/reassign/non-existent', {
      queue_code: 'mgmt-test-queue',
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/routing/monitor/force-assign/:id', () => {
  let forceIxId: string;

  beforeAll(async () => {
    // Create a fresh interaction for force-assign test
    forceIxId = `ix-mgmt-force-${Date.now()}`;
    await db.insert(ixInteractions).values({
      interaction_id: forceIxId,
      conversation_id: 'conv-mgmt-test',
      work_model: 'live_chat',
      queue_code: 'mgmt-test-queue',
      priority: 50,
      state: 'queued',
      source_object_type: 'conversation',
      source_object_id: 'conv-mgmt-test',
    });
  });

  test('returns 400 without agent_id', async () => {
    const res = await req('POST', `/api/routing/monitor/force-assign/${forceIxId}`, {});
    expect(res.status).toBe(400);
  });

  test('force-assigns to agent', async () => {
    const res = await req('POST', `/api/routing/monitor/force-assign/${forceIxId}`, {
      agent_id: 'mgmt-test-agent',
      operator_id: 'admin',
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { success: boolean; assigned_agent_id: string };
    expect(data.success).toBe(true);
    expect(data.assigned_agent_id).toBe('mgmt-test-agent');

    // Verify interaction state
    const ix = await db.query.ixInteractions.findFirst({
      where: eq(ixInteractions.interaction_id, forceIxId),
    });
    expect(ix!.state).toBe('assigned');
    expect(ix!.assigned_agent_id).toBe('mgmt-test-agent');
  });

  test('returns 404 for non-existent interaction', async () => {
    const res = await req('POST', '/api/routing/monitor/force-assign/non-existent', {
      agent_id: 'mgmt-test-agent',
    });
    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Logs & Replay
// ══════════════════════════════════════════════════════════════════════════

describe('GET /api/routing/logs', () => {
  test('returns execution logs', async () => {
    const res = await req('GET', '/api/routing/logs');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: unknown[]; offset: number; limit: number };
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.offset).toBe('number');
    expect(typeof data.limit).toBe('number');
  });

  test('supports pagination', async () => {
    const res = await req('GET', '/api/routing/logs?limit=2&offset=0');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: unknown[]; limit: number };
    expect(data.items.length).toBeLessThanOrEqual(2);
    expect(data.limit).toBe(2);
  });
});

describe('GET /api/routing/logs/:logId/snapshots', () => {
  test('returns 404 for non-existent log', async () => {
    const res = await req('GET', '/api/routing/logs/999999/snapshots');
    expect(res.status).toBe(404);
  });
});

describe('replay API', () => {
  test('POST /api/routing/replay/single — returns 400 without interaction_id', async () => {
    const res = await req('POST', '/api/routing/replay/single', {});
    expect(res.status).toBe(400);
  });

  test('POST /api/routing/replay/task — creates a batch task', async () => {
    const res = await req('POST', '/api/routing/replay/task', {
      task_name: 'api-test-replay',
      interaction_ids: ['ix-mgmt-queued'],
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { task_id: string };
    expect(data.task_id).toBeDefined();
  });

  test('POST /api/routing/replay/task — returns 400 without interaction_ids', async () => {
    const res = await req('POST', '/api/routing/replay/task', {});
    expect(res.status).toBe(400);
  });

  test('POST /api/routing/replay/task — rejects > 100 items', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    const res = await req('POST', '/api/routing/replay/task', { interaction_ids: ids });
    expect(res.status).toBe(400);
  });

  test('GET /api/routing/replay/tasks — lists tasks', async () => {
    const res = await req('GET', '/api/routing/replay/tasks');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: unknown[] };
    expect(Array.isArray(data.items)).toBe(true);
  });

  test('GET /api/routing/replay/tasks/:id — 404 for non-existent', async () => {
    const res = await req('GET', '/api/routing/replay/tasks/non-existent');
    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Audit endpoint
// ══════════════════════════════════════════════════════════════════════════

describe('GET /api/routing/audit', () => {
  test('returns audit logs', async () => {
    const res = await req('GET', '/api/routing/audit');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: unknown[] };
    expect(Array.isArray(data.items)).toBe(true);
  });

  test('filters by operation_type', async () => {
    const res = await req('GET', '/api/routing/audit?operation_type=rule_create');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: Array<{ operation_type: string }> };
    expect(data.items.every(a => a.operation_type === 'rule_create')).toBe(true);
  });

  test('filters by target_type', async () => {
    const res = await req('GET', '/api/routing/audit?target_type=route_rule');
    expect(res.status).toBe(200);
    const data = await res.json() as { items: Array<{ target_type: string }> };
    expect(data.items.every(a => a.target_type === 'route_rule')).toBe(true);
  });
});
