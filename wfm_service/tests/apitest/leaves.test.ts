/**
 * leaves.test.ts — 假勤类型 + 假勤申请（审批流）+ 例外 API 测试
 */
import { describe, it, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();
const BASE = '/api/wfm/leaves';

const json = (body: object) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('Leave Types', () => {
  it('GET /types should list seed types', async () => {
    const res = await app.request(`${BASE}/types`);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it('POST /types should create type', async () => {
    const res = await app.request(`${BASE}/types`, json({
      code: 'MATERNITY', name: '产假', isPaid: true, maxDaysYear: 180,
    }));
    expect(res.status).toBe(201);
  });
});

describe('Leave Requests CRUD', () => {
  it('GET / should list seed leaves', async () => {
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(4);
  });

  it('POST / should create leave request in pending status', async () => {
    const typesRes = await app.request(`${BASE}/types`);
    const { items: types } = await typesRes.json();
    const annual = types.find((t: { code: string }) => t.code === 'ANNUAL');

    const res = await app.request(BASE, json({
      staffId: 'agent_001',
      leaveTypeId: annual.id,
      startTime: '2026-04-15T00:00:00Z',
      endTime: '2026-04-15T23:59:59Z',
      isFullDay: true,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('pending');
  });

  it('POST / without required fields should return 400', async () => {
    const res = await app.request(BASE, json({ staffId: 'agent_001' }));
    expect(res.status).toBe(400);
  });
});

describe('Leave Approval Flow', () => {
  let pendingLeaveId: number;

  it('should create a pending leave', async () => {
    const typesRes = await app.request(`${BASE}/types`);
    const { items: types } = await typesRes.json();

    const res = await app.request(BASE, json({
      staffId: 'agent_002',
      leaveTypeId: types[0].id,
      startTime: '2026-04-20T00:00:00Z',
      endTime: '2026-04-20T23:59:59Z',
    }));
    const body = await res.json();
    pendingLeaveId = body.id;
  });

  it('PUT /:id/approve should approve leave', async () => {
    const res = await app.request(`${BASE}/${pendingLeaveId}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvedBy: 'admin_001' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('approved');
    expect(body.approvedBy).toBe('admin_001');
    expect(body.approvedAt).toBeTruthy();
  });

  it('PUT /:id/approve on non-pending should return 400', async () => {
    const res = await app.request(`${BASE}/${pendingLeaveId}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('PUT /:id/reject should reject pending leave', async () => {
    const typesRes = await app.request(`${BASE}/types`);
    const { items: types } = await typesRes.json();

    const createRes = await app.request(BASE, json({
      staffId: 'agent_003',
      leaveTypeId: types[0].id,
      startTime: '2026-04-21T00:00:00Z',
      endTime: '2026-04-21T23:59:59Z',
    }));
    const { id } = await createRes.json();

    const res = await app.request(`${BASE}/${id}/reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('rejected');
  });
});

describe('Exceptions', () => {
  it('GET /exceptions should list seed exceptions', async () => {
    const res = await app.request(`${BASE}/exceptions`);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /exceptions should create exception', async () => {
    // Get activity id for TRAINING
    const actRes = await app.request('/api/wfm/activities');
    const { items: acts } = await actRes.json();
    const training = acts.find((a: { code: string }) => a.code === 'TRAINING');

    const res = await app.request(`${BASE}/exceptions`, json({
      staffId: 'agent_002',
      activityId: training.id,
      startTime: '2026-04-12T02:00:00Z',
      endTime: '2026-04-12T04:00:00Z',
      note: '客户投诉培训',
    }));
    expect(res.status).toBe(201);
  });

  it('DELETE /exceptions/:id should delete exception', async () => {
    const actRes = await app.request('/api/wfm/activities');
    const { items: acts } = await actRes.json();
    const meeting = acts.find((a: { code: string }) => a.code === 'MEETING');

    const createRes = await app.request(`${BASE}/exceptions`, json({
      staffId: 'agent_001',
      activityId: meeting.id,
      startTime: '2026-04-14T06:00:00Z',
      endTime: '2026-04-14T08:00:00Z',
    }));
    const { id } = await createRes.json();

    const res = await app.request(`${BASE}/exceptions/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});
