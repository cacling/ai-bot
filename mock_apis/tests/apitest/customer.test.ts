/**
 * API tests for: src/routes/customer.ts
 * Mount: /api/customer
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();

async function get(path: string) {
  const res = await app.request(path);
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('GET /api/customer/subscribers/:msisdn', () => {
  test('returns subscriber with plan info for valid phone', async () => {
    const { status, data } = await get('/api/customer/subscribers/13800000001');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    const sub = data.subscriber as Record<string, unknown>;
    expect(sub.msisdn).toBe('13800000001');
    expect(sub.name).toBe('张三');
    expect(sub.status).toBe('active');
    expect(sub.plan).toBeDefined();
    const plan = sub.plan as Record<string, unknown>;
    expect(plan.plan_id).toBe('plan_50g');
  });

  test('includes balance, status, overdue_days', async () => {
    const { data } = await get('/api/customer/subscribers/13800000001');
    const sub = data.subscriber as Record<string, unknown>;
    expect(typeof sub.balance).toBe('number');
    expect(sub.status).toBe('active');
    expect(sub.overdue_days).toBe(0);
  });

  test('returns suspended subscriber with negative balance', async () => {
    const { status, data } = await get('/api/customer/subscribers/13800000003');
    expect(status).toBe(200);
    const sub = data.subscriber as Record<string, unknown>;
    expect(sub.name).toBe('王五');
    expect(sub.status).toBe('suspended');
    expect((sub.balance as number)).toBeLessThan(0);
    expect((sub.overdue_days as number)).toBeGreaterThan(0);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/customer/subscribers/19900000099');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('includes preferences in response', async () => {
    const { data } = await get('/api/customer/subscribers/13800000001');
    const sub = data.subscriber as Record<string, unknown>;
    expect(sub.preferences).toBeDefined();
  });
});

describe('GET /api/customer/subscribers/:msisdn/account-summary', () => {
  test('returns account summary with balance and plan info', async () => {
    const { status, data } = await get('/api/customer/subscribers/13800000001/account-summary');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(typeof data.balance).toBe('number');
    expect(data.status).toBe('active');
    expect(data.has_arrears).toBe(false);
    expect(data.arrears_amount).toBe(0);
    expect(data.plan_name).toBeDefined();
    expect(typeof data.plan_fee).toBe('number');
    expect(typeof data.data_used_gb).toBe('number');
    expect(typeof data.data_total_gb).toBe('number');
  });

  test('returns arrears info for suspended subscriber', async () => {
    const { data } = await get('/api/customer/subscribers/13800000003/account-summary');
    expect(data.has_arrears).toBe(true);
    expect((data.arrears_amount as number)).toBeGreaterThan(0);
    expect((data.overdue_days as number)).toBeGreaterThan(0);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/customer/subscribers/19900000099/account-summary');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});

describe('GET /api/customer/subscribers/:msisdn/preferences', () => {
  test('returns customer preferences', async () => {
    const { status, data } = await get('/api/customer/subscribers/13800000001/preferences');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(data.preferences).toBeDefined();
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/customer/subscribers/19900000099/preferences');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});

describe('GET /api/customer/subscribers/:msisdn/contracts', () => {
  test('returns active contracts list', async () => {
    const { status, data } = await get('/api/customer/subscribers/13800000001/contracts');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(typeof data.count).toBe('number');
    expect(Array.isArray(data.contracts)).toBe(true);
    expect((data.count as number)).toBeGreaterThan(0);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/customer/subscribers/19900000099/contracts');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});

describe('GET /api/customer/subscribers/:msisdn/services', () => {
  test('returns subscribed services list for 13800000001', async () => {
    const { status, data } = await get('/api/customer/subscribers/13800000001/services');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect((data.count as number)).toBeGreaterThanOrEqual(2);
    const services = data.services as Record<string, unknown>[];
    const serviceIds = services.map((s) => s.service_id);
    expect(serviceIds).toContain('video_pkg');
    expect(serviceIds).toContain('sms_100');
  });

  test('each service has service_id, name, monthly_fee', async () => {
    const { data } = await get('/api/customer/subscribers/13800000001/services');
    const services = data.services as Record<string, unknown>[];
    for (const svc of services) {
      expect(svc.service_id).toBeDefined();
      expect(svc.name).toBeDefined();
      expect(typeof svc.monthly_fee).toBe('number');
    }
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/customer/subscribers/19900000099/services');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});

describe('GET /api/customer/subscribers/:msisdn/household', () => {
  test('returns household members for subscriber with household', async () => {
    const { status, data } = await get('/api/customer/subscribers/13800000002/household');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.household).toBeDefined();
    expect(Array.isArray(data.members)).toBe(true);
  });

  test('returns null household for subscriber without household', async () => {
    const { status, data } = await get('/api/customer/subscribers/13800000001/household');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.household).toBeNull();
    expect(data.members).toEqual([]);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/customer/subscribers/19900000099/household');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});

describe('GET /api/customer/subscribers/:msisdn/subscription-history', () => {
  test('returns subscription history for subscriber with services', async () => {
    const { status, data } = await get('/api/customer/subscribers/13800000001/subscription-history');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(typeof data.count).toBe('number');
    expect(Array.isArray(data.subscription_history)).toBe(true);
    expect((data.count as number)).toBeGreaterThanOrEqual(2);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/customer/subscribers/19900000099/subscription-history');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});
