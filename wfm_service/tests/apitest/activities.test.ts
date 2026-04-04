/**
 * activities.test.ts — 活动类型 + 覆盖规则 API 测试
 */
import { describe, it, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();
const BASE = '/api/wfm/activities';

const json = (body: object) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const jsonPut = (body: object) => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('Activities CRUD', () => {
  it('GET / should list seed activities', async () => {
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(8);
    expect(items.find((a: { code: string }) => a.code === 'WORK')).toBeTruthy();
  });

  it('POST / should create a new activity', async () => {
    const res = await app.request(BASE, json({ code: 'TEST_ACT', name: '测试活动', color: '#ff0000' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.code).toBe('TEST_ACT');
    expect(body.id).toBeGreaterThan(0);
  });

  it('POST / without code should return 400', async () => {
    const res = await app.request(BASE, json({ name: '缺少code' }));
    expect(res.status).toBe(400);
  });

  it('PUT /:id should update activity', async () => {
    // Create first
    const createRes = await app.request(BASE, json({ code: 'UPD_ACT', name: '待更新' }));
    const { id } = await createRes.json();

    const res = await app.request(`${BASE}/${id}`, jsonPut({ name: '已更新', color: '#00ff00' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('已更新');
    expect(body.color).toBe('#00ff00');
  });

  it('DELETE /:id should delete activity', async () => {
    const createRes = await app.request(BASE, json({ code: 'DEL_ACT', name: '待删除' }));
    const { id } = await createRes.json();

    const res = await app.request(`${BASE}/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });
});

describe('Cover Rules', () => {
  it('GET /:id/cover-rules should list rules for activity', async () => {
    // Get WORK activity (seeded)
    const listRes = await app.request(BASE);
    const { items } = await listRes.json();
    const meeting = items.find((a: { code: string }) => a.code === 'MEETING');

    const res = await app.request(`${BASE}/${meeting.id}/cover-rules`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /:id/cover-rules should create rule', async () => {
    const listRes = await app.request(BASE);
    const { items } = await listRes.json();
    const work = items.find((a: { code: string }) => a.code === 'WORK');
    const offline = items.find((a: { code: string }) => a.code === 'OFFLINE');

    const res = await app.request(`${BASE}/${work.id}/cover-rules`, json({
      targetActivityId: offline.id,
      canCover: true,
    }));
    expect(res.status).toBe(201);
  });

  it('DELETE /cover-rules/:id should delete rule', async () => {
    // Create a rule to delete
    const listRes = await app.request(BASE);
    const { items } = await listRes.json();
    const dayOff = items.find((a: { code: string }) => a.code === 'DAY_OFF');
    const work = items.find((a: { code: string }) => a.code === 'WORK');

    const createRes = await app.request(`${BASE}/${dayOff.id}/cover-rules`, json({
      targetActivityId: work.id,
    }));
    const rule = await createRes.json();

    const res = await app.request(`${BASE}/cover-rules/${rule.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});
