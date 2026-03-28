/**
 * API tests for: src/routes/risk.ts
 * Mount: /api/risk
 * Routes: GET accounts/:msisdn
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();

async function get(path: string) {
  const res = await app.request(path);
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('GET /api/risk/accounts/:msisdn', () => {
  test('returns low risk for clean device (13800000001)', async () => {
    // 张三: all device_context flags are false → score=0 → low
    const { status, data } = await get('/api/risk/accounts/13800000001');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(data.customer_name).toBe('张三');
    expect(data.risk_level).toBe('low');
    expect(data.risk_score).toBe(0);
    expect(data.indicators).toEqual([]);
    expect(typeof data.recommended_action).toBe('string');
  });

  test('returns low risk for vpn-only device (13800000002)', async () => {
    // 李四: has_vpn_active=true → score=10 → low (< 25)
    const { status, data } = await get('/api/risk/accounts/13800000002');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.risk_level).toBe('low');
    expect(data.risk_score).toBe(10);
    const indicators = data.indicators as string[];
    expect(indicators).toContain('vpn_active');
  });

  test('returns high risk for suspicious device (13800000003)', async () => {
    // 王五: developer_mode_on(20) + login_location_changed(25) + new_device(20) + otp_delivery_issue(10) = 75 → high
    const { status, data } = await get('/api/risk/accounts/13800000003');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.risk_level).toBe('high');
    expect(data.risk_score).toBe(75);
    const indicators = data.indicators as string[];
    expect(indicators).toContain('developer_mode_on');
    expect(indicators).toContain('login_location_changed');
    expect(indicators).toContain('new_device');
    expect(indicators).toContain('otp_delivery_issue');
  });

  test('recommended_action matches risk level', async () => {
    const { data: lowData } = await get('/api/risk/accounts/13800000001');
    expect(lowData.recommended_action).toContain('风险较低');

    const { data: highData } = await get('/api/risk/accounts/13800000003');
    expect(highData.recommended_action).toContain('安全团队');
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/risk/accounts/19900000099');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});
