/**
 * staffing.test.ts — 人力需求 CRUD API 测试
 */
import { describe, it, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();
const PLANS = '/api/wfm/plans';
const BASE = '/api/wfm/staffing';

const json = (body: object) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('Staffing Requirements CRUD', () => {
  let planId: number;

  it('should create a plan for testing', async () => {
    const res = await app.request(PLANS, json({
      name: '人力需求测试', startDate: '2026-04-07', endDate: '2026-04-13',
    }));
    const body = await res.json();
    planId = body.id;
  });

  it('POST /requirements should create requirement', async () => {
    const res = await app.request(`${BASE}/requirements`, json({
      planId,
      date: '2026-04-07',
      startTime: '08:00',
      endTime: '20:00',
      minAgents: 3,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.minAgents).toBe(3);
  });

  it('POST /requirements without required fields should return 400', async () => {
    const res = await app.request(`${BASE}/requirements`, json({ planId }));
    expect(res.status).toBe(400);
  });

  it('GET /requirements should list by plan_id', async () => {
    const res = await app.request(`${BASE}/requirements?plan_id=${planId}`);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /requirements without plan_id should return 400', async () => {
    const res = await app.request(`${BASE}/requirements`);
    expect(res.status).toBe(400);
  });

  it('PUT /requirements/:id should update', async () => {
    const listRes = await app.request(`${BASE}/requirements?plan_id=${planId}`);
    const { items } = await listRes.json();
    const req = items[0];

    const res = await app.request(`${BASE}/requirements/${req.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minAgents: 5 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.minAgents).toBe(5);
  });

  it('DELETE /requirements/:id should delete', async () => {
    const createRes = await app.request(`${BASE}/requirements`, json({
      planId,
      date: '2026-04-08',
      startTime: '09:00',
      endTime: '18:00',
      minAgents: 2,
    }));
    const { id } = await createRes.json();

    const res = await app.request(`${BASE}/requirements/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});
