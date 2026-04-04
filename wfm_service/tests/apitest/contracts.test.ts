/**
 * contracts.test.ts — 合同 + 合同包 + 坐席合同 API 测试
 */
import { describe, it, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();
const BASE = '/api/wfm/contracts';

const json = (body: object) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('Contracts CRUD', () => {
  it('GET / should list seed contracts', async () => {
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it('POST / should create contract', async () => {
    const res = await app.request(BASE, json({
      name: '临时合同',
      minHoursDay: 2,
      maxHoursDay: 6,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('临时合同');
  });

  it('PUT /:id should update contract', async () => {
    const listRes = await app.request(BASE);
    const { items } = await listRes.json();
    const ct = items[0];

    const res = await app.request(`${BASE}/${ct.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '更新合同名' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('更新合同名');
  });

  it('DELETE /:id should delete contract', async () => {
    const createRes = await app.request(BASE, json({ name: '待删除合同' }));
    const { id } = await createRes.json();
    const res = await app.request(`${BASE}/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});

describe('Contract Packages', () => {
  it('GET /:id/packages should list bindings', async () => {
    const listRes = await app.request(BASE);
    const { items } = await listRes.json();
    const ct = items[0];

    const res = await app.request(`${BASE}/${ct.id}/packages`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toBeArray();
  });
});

describe('Staff Contracts', () => {
  it('GET /staff should list staff-contract bindings', async () => {
    const res = await app.request(`${BASE}/staff`);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(7);
  });

  it('POST /staff should create binding', async () => {
    const listRes = await app.request(BASE);
    const { items } = await listRes.json();

    const res = await app.request(`${BASE}/staff`, json({
      staffId: 'test_staff_001',
      contractId: items[0].id,
    }));
    expect(res.status).toBe(201);
  });
});
