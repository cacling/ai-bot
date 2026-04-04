/**
 * shifts.test.ts — 班制/班次/活动模板/班次包 API 测试
 */
import { describe, it, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();
const BASE = '/api/wfm/shifts';

const json = (body: object) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('Shift Patterns', () => {
  it('GET /patterns should list seed patterns', async () => {
    const res = await app.request(`${BASE}/patterns`);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(4);
  });

  it('POST /patterns should create a pattern', async () => {
    const res = await app.request(`${BASE}/patterns`, json({ name: '夜班', description: '00:00-08:00' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('夜班');
  });

  it('GET /patterns/:id should return pattern with shifts', async () => {
    const listRes = await app.request(`${BASE}/patterns`);
    const { items } = await listRes.json();
    const first = items[0];

    const res = await app.request(`${BASE}/patterns/${first.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBeTruthy();
    expect(body.shifts).toBeArray();
  });
});

describe('Shifts CRUD', () => {
  it('GET / should list seed shifts', async () => {
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(4);
  });

  it('POST / should create a shift', async () => {
    const patternsRes = await app.request(`${BASE}/patterns`);
    const { items: patterns } = await patternsRes.json();

    const res = await app.request(BASE, json({
      patternId: patterns[0].id,
      name: '测试班 00-08',
      startTime: '00:00',
      endTime: '08:00',
      durationMinutes: 480,
    }));
    expect(res.status).toBe(201);
  });

  it('PUT /:id should update shift', async () => {
    const listRes = await app.request(BASE);
    const { items } = await listRes.json();
    const shift = items[items.length - 1];

    const res = await app.request(`${BASE}/${shift.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '更新班次' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('更新班次');
  });
});

describe('Shift Activities', () => {
  it('GET /:id/activities should list templates', async () => {
    const listRes = await app.request(BASE);
    const { items } = await listRes.json();
    const shift = items[0];

    const res = await app.request(`${BASE}/${shift.id}/activities`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Shift Packages', () => {
  it('GET /packages should list seed packages', async () => {
    const res = await app.request(`${BASE}/packages`);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it('POST /packages should create package', async () => {
    const res = await app.request(`${BASE}/packages`, json({ name: '测试包' }));
    expect(res.status).toBe(201);
  });

  it('GET /packages/:id should return package with items', async () => {
    const listRes = await app.request(`${BASE}/packages`);
    const { items } = await listRes.json();
    const pkg = items[0];

    const res = await app.request(`${BASE}/packages/${pkg.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toBeArray();
  });
});
