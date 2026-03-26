/**
 * API tests for: src/routes/identity.ts
 * Mount: /api/identity
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();

async function get(path: string) {
  const res = await app.request(path);
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

const tick = () => new Promise(r => setTimeout(r, 5));

async function post(path: string, body: Record<string, unknown>) {
  await tick(); // avoid Date.now() PK collision
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('POST /api/identity/otp/send', () => {
  test('returns 400 when phone is missing', async () => {
    const { status, data } = await post('/api/identity/otp/send', {});
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await post('/api/identity/otp/send', { phone: '19900000099' });
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('generates OTP for valid phone (last 6 digits zero-padded)', async () => {
    const { status, data } = await post('/api/identity/otp/send', { phone: '13800000001' });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.request_id).toBeDefined();
    expect(data.phone).toBe('13800000001');
    expect(data.channel).toBe('sms');
    expect(data.mock_otp).toBe('000001');
    expect(data.expires_at).toBeDefined();
  });

  test('returns mock_otp as last 6 digits for 13800000002', async () => {
    const { status, data } = await post('/api/identity/otp/send', { phone: '13800000002' });
    expect(status).toBe(200);
    expect(data.mock_otp).toBe('000002');
  });

  test('returns delayed delivery_status for 13800000003', async () => {
    const { status, data } = await post('/api/identity/otp/send', { phone: '13800000003' });
    expect(status).toBe(200);
    expect(data.delivery_status).toBe('delayed');
  });

  test('returns sent delivery_status for normal phone', async () => {
    const { status, data } = await post('/api/identity/otp/send', { phone: '13800000001' });
    expect(status).toBe(200);
    expect(data.delivery_status).toBe('sent');
  });
});

describe('POST /api/identity/verify', () => {
  test('returns 400 when phone or otp is missing', async () => {
    const r1 = await post('/api/identity/verify', { phone: '13800000001' });
    expect(r1.status).toBe(400);
    expect(r1.data.success).toBe(false);

    const r2 = await post('/api/identity/verify', { otp: '1234' });
    expect(r2.status).toBe(400);
    expect(r2.data.success).toBe(false);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await post('/api/identity/verify', { phone: '19900000099', otp: '1234' });
    expect(status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.verified).toBe(false);
  });

  test('returns verified:true for legacy mock OTP "1234"', async () => {
    const { status, data } = await post('/api/identity/verify', { phone: '13800000001', otp: '1234' });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.verified).toBe(true);
    expect(data.customer_name).toBe('张三');
    expect(data.verification_method).toBe('otp');
  });

  test('returns verified:true for correct OTP after send', async () => {
    await post('/api/identity/otp/send', { phone: '13800000002' });
    const { status, data } = await post('/api/identity/verify', { phone: '13800000002', otp: '000002' });
    expect(status).toBe(200);
    expect(data.verified).toBe(true);
    expect(data.customer_name).toBe('李四');
  });

  test('returns verified:false for incorrect OTP', async () => {
    const { status, data } = await post('/api/identity/verify', { phone: '13800000001', otp: '999999' });
    expect(status).toBe(200);
    expect(data.success).toBe(false);
    expect(data.verified).toBe(false);
    expect(data.customer_name).toBeNull();
  });
});

describe('GET /api/identity/accounts/:msisdn/login-events', () => {
  test('returns login event history for known phone', async () => {
    const { status, data } = await get('/api/identity/accounts/13800000001/login-events');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(typeof data.count).toBe('number');
    expect(Array.isArray(data.events)).toBe(true);
    expect((data.count as number)).toBeGreaterThanOrEqual(1);
  });

  test('includes latest_state in response', async () => {
    const { data } = await get('/api/identity/accounts/13800000001/login-events');
    expect(data.latest_state).toBeDefined();
    const latest = data.latest_state as Record<string, unknown>;
    expect(latest.result).toBeDefined();
    expect(latest.event_type).toBeDefined();
    expect(latest.occurred_at).toBeDefined();
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/identity/accounts/19900000099/login-events');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('returns null latest_state for phone with no events', async () => {
    // 13800000002 has login events seeded (LOGIN-002), so use a phone with no events
    // 13900000005 has no login events in seed data
    const { status, data } = await get('/api/identity/accounts/13900000005/login-events');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.count).toBe(0);
    expect(data.latest_state).toBeNull();
    expect(data.events).toEqual([]);
  });
});
