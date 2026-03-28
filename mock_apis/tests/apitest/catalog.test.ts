/**
 * API tests for: src/routes/catalog.ts
 * Mount: /api/catalog
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();

async function get(path: string) {
  const res = await app.request(path);
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('GET /api/catalog/plans', () => {
  test('returns all available plans', async () => {
    const { status, data } = await get('/api/catalog/plans');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.count).toBe('number');
    expect((data.count as number)).toBeGreaterThanOrEqual(4);
    const plans = data.plans as Record<string, unknown>[];
    const planIds = plans.map((p) => p.plan_id);
    expect(planIds).toContain('plan_10g');
    expect(planIds).toContain('plan_50g');
    expect(planIds).toContain('plan_unlimited');
    expect(planIds).toContain('plan_100g');
  });

  test('each plan has plan_id, name, monthly_fee, data_gb', async () => {
    const { data } = await get('/api/catalog/plans');
    const plans = data.plans as Record<string, unknown>[];
    for (const plan of plans) {
      expect(plan.plan_id).toBeDefined();
      expect(plan.name).toBeDefined();
      expect(typeof plan.monthly_fee).toBe('number');
      expect(typeof plan.data_gb).toBe('number');
    }
  });

  test('features are parsed as arrays', async () => {
    const { data } = await get('/api/catalog/plans');
    const plans = data.plans as Record<string, unknown>[];
    for (const plan of plans) {
      expect(Array.isArray(plan.features)).toBe(true);
    }
  });
});

describe('GET /api/catalog/plans/:planId', () => {
  test('returns plan detail for plan_50g', async () => {
    const { status, data } = await get('/api/catalog/plans/plan_50g');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    const plan = data.plan as Record<string, unknown>;
    expect(plan.plan_id).toBe('plan_50g');
    expect(plan.name).toBeDefined();
    expect(typeof plan.monthly_fee).toBe('number');
    expect(Array.isArray(plan.features)).toBe(true);
  });

  test('returns plan detail for plan_unlimited', async () => {
    const { status, data } = await get('/api/catalog/plans/plan_unlimited');
    expect(status).toBe(200);
    const plan = data.plan as Record<string, unknown>;
    expect(plan.plan_id).toBe('plan_unlimited');
  });

  test('returns 404 for non-existent plan_id', async () => {
    const { status, data } = await get('/api/catalog/plans/plan_nonexistent');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});

describe('GET /api/catalog/value-added-services', () => {
  test('returns all value-added services', async () => {
    const { status, data } = await get('/api/catalog/value-added-services');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.count).toBe('number');
    expect((data.count as number)).toBeGreaterThanOrEqual(4);
    const services = data.services as Record<string, unknown>[];
    const serviceIds = services.map((s) => s.service_id);
    expect(serviceIds).toContain('video_pkg');
    expect(serviceIds).toContain('sms_100');
  });

  test('each service has service_id, name, monthly_fee', async () => {
    const { data } = await get('/api/catalog/value-added-services');
    const services = data.services as Record<string, unknown>[];
    for (const svc of services) {
      expect(svc.service_id).toBeDefined();
      expect(svc.name).toBeDefined();
      expect(typeof svc.monthly_fee).toBe('number');
    }
  });
});
