/**
 * groups.test.ts — 排班组 + 成员 API 测试
 */
import { describe, it, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();
const BASE = '/api/wfm/groups';

const json = (body: object) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('Groups CRUD', () => {
  it('GET / should list seed groups', async () => {
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('POST / should create group', async () => {
    const res = await app.request(BASE, json({ name: '测试组', maxStartDiffMinutes: 60 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('测试组');
  });

  it('PUT /:id should update group', async () => {
    const createRes = await app.request(BASE, json({ name: '待更新组' }));
    const { id } = await createRes.json();

    const res = await app.request(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '已更新组' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('已更新组');
  });

  it('DELETE /:id should delete group', async () => {
    const createRes = await app.request(BASE, json({ name: '待删除组' }));
    const { id } = await createRes.json();
    const res = await app.request(`${BASE}/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});

describe('Group Members', () => {
  it('GET /:id/members should list members', async () => {
    const listRes = await app.request(BASE);
    const { items } = await listRes.json();
    const grp = items[0];

    const res = await app.request(`${BASE}/${grp.id}/members`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /:id/members + DELETE should manage members', async () => {
    const listRes = await app.request(BASE);
    const { items } = await listRes.json();
    const grp = items[0];

    // Add member
    const addRes = await app.request(`${BASE}/${grp.id}/members`, json({ staffId: 'test_member_001' }));
    expect(addRes.status).toBe(201);
    const member = await addRes.json();

    // Remove member
    const delRes = await app.request(`${BASE}/${grp.id}/members/${member.id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);
  });
});
