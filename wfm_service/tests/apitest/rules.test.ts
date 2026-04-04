/**
 * rules.test.ts — 规则定义/绑定/链 CRUD + 发布/回滚 API 测试
 */
import { describe, it, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();
const RULES = '/api/wfm/rules';
const PLANS = '/api/wfm/plans';

const json = (body: object) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('Rule Definitions', () => {
  it('GET /definitions should list seed definitions', async () => {
    const res = await app.request(`${RULES}/definitions`);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(13);
  });

  it('POST /definitions should create definition', async () => {
    const res = await app.request(`${RULES}/definitions`, json({
      code: 'CUSTOM_RULE', name: '自定义规则', category: 'custom', stage: 'edit_commit',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.code).toBe('CUSTOM_RULE');
  });

  it('PUT /definitions/:id should update', async () => {
    const createRes = await app.request(`${RULES}/definitions`, json({
      code: 'UPD_RULE', name: '待更新',
    }));
    const { id } = await createRes.json();

    const res = await app.request(`${RULES}/definitions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '已更新规则' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('已更新规则');
  });
});

describe('Rule Bindings', () => {
  it('GET /bindings should list seed bindings', async () => {
    const res = await app.request(`${RULES}/bindings`);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(13);
  });

  it('POST + DELETE /bindings lifecycle', async () => {
    const defsRes = await app.request(`${RULES}/definitions`);
    const { items: defs } = await defsRes.json();

    const createRes = await app.request(`${RULES}/bindings`, json({
      definitionId: defs[0].id,
      scopeType: 'global',
      priority: 50,
    }));
    expect(createRes.status).toBe(201);
    const binding = await createRes.json();

    const delRes = await app.request(`${RULES}/bindings/${binding.id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);
  });
});

describe('Rule Chains', () => {
  it('GET /chains should list seed chains', async () => {
    const res = await app.request(`${RULES}/chains`);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(13);
  });

  it('POST + DELETE /chains lifecycle', async () => {
    const bindingsRes = await app.request(`${RULES}/bindings`);
    const { items: bindings } = await bindingsRes.json();

    const createRes = await app.request(`${RULES}/chains`, json({
      stage: 'edit_commit',
      executionOrder: 99,
      bindingId: bindings[0].id,
    }));
    expect(createRes.status).toBe(201);
    const chain = await createRes.json();

    const delRes = await app.request(`${RULES}/chains/${chain.id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);
  });
});

describe('Publish & Rollback', () => {
  let planId: number;

  it('should create and generate a plan', async () => {
    const createRes = await app.request(PLANS, json({
      name: '发布测试计划', startDate: '2026-04-07', endDate: '2026-04-07',
    }));
    const plan = await createRes.json();
    planId = plan.id;

    await app.request(`${PLANS}/${planId}/generate`, { method: 'POST' });
  });

  it('POST /plans/:id/publish/validate should validate before publish', async () => {
    const res = await app.request(`${PLANS}/${planId}/publish/validate`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('valid');
    expect(body).toHaveProperty('errors');
  });

  it('POST /plans/:id/publish should publish plan', async () => {
    const res = await app.request(`${PLANS}/${planId}/publish`, json({
      publishedBy: 'admin_001', publisherName: '管理员',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('published');
    expect(body.versionNo).toBeGreaterThan(1);
  });

  it('should not publish already published plan', async () => {
    const res = await app.request(`${PLANS}/${planId}/publish`, json({}));
    expect(res.status).toBe(400);
  });

  it('GET /plans/:id/history should show version and logs', async () => {
    const res = await app.request(`${PLANS}/${planId}/history`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.versions.length).toBeGreaterThanOrEqual(1);
    expect(body.logs.length).toBeGreaterThanOrEqual(1);
    expect(body.logs[0].action).toBe('publish');
  });

  it('POST /plans/:id/rollback should rollback to editing', async () => {
    const res = await app.request(`${PLANS}/${planId}/rollback`, json({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('editing');

    // Verify plan is now editable
    const planRes = await app.request(`${PLANS}/${planId}`);
    const plan = await planRes.json();
    expect(plan.status).toBe('editing');
  });

  it('GET /plans/:id/history should show rollback log', async () => {
    const res = await app.request(`${PLANS}/${planId}/history`);
    const body = await res.json();
    const rollbackLog = body.logs.find((l: { action: string }) => l.action === 'rollback');
    expect(rollbackLog).toBeTruthy();
  });
});
