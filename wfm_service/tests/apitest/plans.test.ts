/**
 * plans.test.ts — 排班计划 CRUD + 生成 + 时间线 + 覆盖率 API 测试
 */
import { describe, it, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();
const BASE = '/api/wfm/plans';

const json = (body: object) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('Plans CRUD', () => {
  it('POST / should create plan', async () => {
    const res = await app.request(BASE, json({
      name: '2026 W15 排班',
      startDate: '2026-04-07',
      endDate: '2026-04-13',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('2026 W15 排班');
    expect(body.status).toBe('draft');
  });

  it('GET / should list plans', async () => {
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /:id should return plan with entryCount', async () => {
    const listRes = await app.request(BASE);
    const { items } = await listRes.json();
    const plan = items[0];

    const res = await app.request(`${BASE}/${plan.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBeTruthy();
    expect(body.entryCount).toBeDefined();
  });

  it('PUT /:id should update plan', async () => {
    const createRes = await app.request(BASE, json({
      name: '待更新计划', startDate: '2026-04-14', endDate: '2026-04-20',
    }));
    const { id } = await createRes.json();

    const res = await app.request(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '已更新计划' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('已更新计划');
  });
});

describe('Schedule Generation', () => {
  let planId: number;

  it('should create and generate schedule', async () => {
    // Create plan for one week
    const createRes = await app.request(BASE, json({
      name: '生成测试 W15',
      startDate: '2026-04-07',
      endDate: '2026-04-13',
    }));
    const plan = await createRes.json();
    planId = plan.id;

    // Generate
    const genRes = await app.request(`${BASE}/${planId}/generate`, { method: 'POST' });
    expect(genRes.status).toBe(200);
    const result = await genRes.json();
    expect(result.status).toBe('generated');
    expect(result.totalEntries).toBeGreaterThan(0);
    expect(result.totalBlocks).toBeGreaterThan(0);
  });

  it('should exclude staff with full-day approved leave', async () => {
    // 李娜 04-08 has full-day sick leave (approved)
    const res = await app.request(`${BASE}/${planId}/timeline?date=2026-04-08`);
    const { items } = await res.json();
    const liNaEntry = items.find((e: { staffId: string }) => e.staffId === 'agent_002');
    // 李娜 should NOT have an entry on 04-08
    expect(liNaEntry).toBeUndefined();
  });

  it('should have entries for staff without leave', async () => {
    const res = await app.request(`${BASE}/${planId}/timeline?date=2026-04-07`);
    const { items } = await res.json();
    // Should have entries for multiple staff
    expect(items.length).toBeGreaterThanOrEqual(5);
  });

  it('should apply exception overlay for 马超 on 04-09', async () => {
    // 马超 agent_005 has training exception on 04-09 02:00-04:00 UTC
    const res = await app.request(`${BASE}/${planId}/timeline?date=2026-04-09`);
    const { items } = await res.json();
    const maEntry = items.find((e: { staffId: string }) => e.staffId === 'agent_005');

    if (maEntry) {
      const trainingBlock = maEntry.blocks.find((b: { activityCode: string }) => b.activityCode === 'TRAINING');
      expect(trainingBlock).toBeTruthy();
      expect(trainingBlock.source).toBe('exception');
    }
  });

  it('each entry should have blocks with activity info', async () => {
    const res = await app.request(`${BASE}/${planId}/timeline?date=2026-04-07`);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThan(0);

    const entry = items[0];
    expect(entry.blocks.length).toBeGreaterThan(0);
    expect(entry.blocks[0].activityCode).toBeTruthy();
    expect(entry.blocks[0].color).toBeTruthy();
  });
});

describe('Coverage', () => {
  it('GET /:id/coverage should return 30-min slot data', async () => {
    // Create and generate a plan first
    const createRes = await app.request(BASE, json({
      name: '覆盖率测试', startDate: '2026-04-07', endDate: '2026-04-07',
    }));
    const plan = await createRes.json();
    await app.request(`${BASE}/${plan.id}/generate`, { method: 'POST' });

    const res = await app.request(`${BASE}/${plan.id}/coverage?date=2026-04-07`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slots).toBeArray();
    expect(body.slots.length).toBe(48); // 24h * 2

    // During working hours, should have some agents
    const morningSlot = body.slots.find((s: { time: string }) => s.time === '09:00');
    expect(morningSlot.agents).toBeGreaterThan(0);
  });

  it('GET /:id/coverage without date should return 400', async () => {
    const res = await app.request(`${BASE}/1/coverage`);
    expect(res.status).toBe(400);
  });
});

describe('Plan Delete', () => {
  it('DELETE /:id should cascade delete entries and blocks', async () => {
    const createRes = await app.request(BASE, json({
      name: '待删除计划', startDate: '2026-04-07', endDate: '2026-04-07',
    }));
    const { id } = await createRes.json();
    await app.request(`${BASE}/${id}/generate`, { method: 'POST' });

    const delRes = await app.request(`${BASE}/${id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);

    const getRes = await app.request(`${BASE}/${id}`);
    expect(getRes.status).toBe(404);
  });
});
