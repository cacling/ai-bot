/**
 * API tests for km_service internal endpoints (/api/internal/*)
 *
 * These endpoints serve as the backend's gateway to km.db data,
 * enforcing the Database Ownership Isolation principle (Constitution XII).
 *
 * Prerequisites: km_service running on KM_SERVICE_PORT (default 18010)
 */
import { describe, test, expect, beforeAll } from 'bun:test';

const BASE = `http://localhost:${process.env.KM_SERVICE_PORT ?? 18010}`;

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, data: await res.json() };
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

// ── Skill Registry ────────────────────────────────────────────────────────

describe('Internal: Skill Registry', () => {
  test('GET /api/internal/skills/registry returns items array', async () => {
    const { status, data } = await get('/api/internal/skills/registry');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
  });

  test('GET /api/internal/skills/registry/:skillId returns single skill or 404', async () => {
    // First get all skills to find a valid ID
    const { data: all } = await get('/api/internal/skills/registry');
    if (all.items.length === 0) return; // skip if no skills seeded

    const skillId = all.items[0].id;
    const { status, data } = await get(`/api/internal/skills/registry/${skillId}`);
    expect(status).toBe(200);
    expect(data.id).toBe(skillId);
  });

  test('GET /api/internal/skills/registry/nonexistent returns 404', async () => {
    const { status } = await get('/api/internal/skills/registry/nonexistent-skill-xyz');
    expect(status).toBe(404);
  });

  test('POST /api/internal/skills/registry/:skillId/sync-metadata updates metadata', async () => {
    const { data: all } = await get('/api/internal/skills/registry');
    if (all.items.length === 0) return;

    const skillId = all.items[0].id;
    const { status, data } = await post(`/api/internal/skills/registry/${skillId}/sync-metadata`, {
      description: 'test description update',
      channels: '["online","voice"]',
      mode: 'inbound',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);

    // Verify update
    const { data: updated } = await get(`/api/internal/skills/registry/${skillId}`);
    expect(updated.description).toBe('test description update');
  });
});

// ── Workflow Specs ────────────────────────────────────────────────────────

describe('Internal: Workflow Specs', () => {
  const testSkillId = '__test_workflow_skill__';

  test('POST /api/internal/skills/workflow-specs creates spec', async () => {
    const { status, data } = await post('/api/internal/skills/workflow-specs', {
      skill_id: testSkillId,
      version_no: 1,
      spec_json: JSON.stringify({ states: ['init', 'query', 'done'] }),
      status: 'published',
    });
    expect(status).toBe(201);
    expect(data.ok).toBe(true);
  });

  test('GET /api/internal/skills/workflow-specs/:skillId returns spec', async () => {
    const { status, data } = await get(`/api/internal/skills/workflow-specs/${testSkillId}`);
    expect(status).toBe(200);
    expect(data.skill_id).toBe(testSkillId);
    expect(data.status).toBe('published');
    const spec = JSON.parse(data.spec_json);
    expect(spec.states).toEqual(['init', 'query', 'done']);
  });

  test('GET /api/internal/skills/workflow-specs/nonexistent returns 404', async () => {
    const { status } = await get('/api/internal/skills/workflow-specs/nonexistent-xyz');
    expect(status).toBe(404);
  });

  test('POST upsert replaces existing spec', async () => {
    await post('/api/internal/skills/workflow-specs', {
      skill_id: testSkillId,
      version_no: 1,
      spec_json: JSON.stringify({ states: ['init', 'updated'] }),
      status: 'published',
    });

    const { data } = await get(`/api/internal/skills/workflow-specs/${testSkillId}`);
    const spec = JSON.parse(data.spec_json);
    expect(spec.states).toEqual(['init', 'updated']);
  });

  test('POST requires skill_id, version_no, spec_json', async () => {
    const { status } = await post('/api/internal/skills/workflow-specs', {});
    expect(status).toBe(400);
  });
});

// ── MCP Servers ───────────────────────────────────────────────────────────

describe('Internal: MCP Servers', () => {
  test('GET /api/internal/mcp/servers-full returns items with all fields', async () => {
    const { status, data } = await get('/api/internal/mcp/servers-full');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);

    if (data.items.length > 0) {
      const server = data.items[0];
      expect(server).toHaveProperty('id');
      expect(server).toHaveProperty('name');
      expect(server).toHaveProperty('enabled');
      expect(server).toHaveProperty('transport');
    }
  });
});

// ── MCP Tools ─────────────────────────────────────────────────────────────

describe('Internal: MCP Tools', () => {
  test('GET /api/internal/mcp/tools-full returns items', async () => {
    const { status, data } = await get('/api/internal/mcp/tools-full');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
  });
});

// ── Tool Bindings ─────────────────────────────────────────────────────────

describe('Internal: Tool Bindings', () => {
  test('GET /api/internal/mcp/tool-bindings returns implementations and connectors', async () => {
    const { status, data } = await get('/api/internal/mcp/tool-bindings');
    expect(status).toBe(200);
    expect(Array.isArray(data.implementations)).toBe(true);
    expect(Array.isArray(data.connectors)).toBe(true);
  });
});
