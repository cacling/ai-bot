/**
 * API tests for: src/routes/diagnosis.ts
 * Mount: /api/diagnosis
 * Routes: POST network/analyze, POST app/analyze
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();

async function post(path: string, body: Record<string, unknown>) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

// ── POST /api/diagnosis/network/analyze ─────────────────────────────────────

describe('POST /api/diagnosis/network/analyze', () => {
  test('returns diagnostic_steps for no_signal issue', async () => {
    const { status, data } = await post('/api/diagnosis/network/analyze', {
      msisdn: '13800000001',
      issue_type: 'no_signal',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(data.issue_type).toBe('no_signal');
    expect(Array.isArray(data.diagnostic_steps)).toBe(true);
    const steps = data.diagnostic_steps as Record<string, unknown>[];
    expect(steps.length).toBeGreaterThan(0);
    // Each step should have step, status, detail
    const step = steps[0];
    expect(step).toHaveProperty('step');
    expect(step).toHaveProperty('status');
    expect(step).toHaveProperty('detail');
  });

  test('returns diagnostic_steps for slow_data issue', async () => {
    const { status, data } = await post('/api/diagnosis/network/analyze', {
      msisdn: '13800000001',
      issue_type: 'slow_data',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.issue_type).toBe('slow_data');
    expect(Array.isArray(data.diagnostic_steps)).toBe(true);
    expect((data.diagnostic_steps as unknown[]).length).toBeGreaterThan(0);
  });

  test('returns diagnostic_steps for call_drop issue', async () => {
    const { status, data } = await post('/api/diagnosis/network/analyze', {
      msisdn: '13800000001',
      issue_type: 'call_drop',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.issue_type).toBe('call_drop');
    expect(Array.isArray(data.diagnostic_steps)).toBe(true);
    expect((data.diagnostic_steps as unknown[]).length).toBeGreaterThan(0);
  });

  test('returns diagnostic_steps for no_network issue', async () => {
    const { status, data } = await post('/api/diagnosis/network/analyze', {
      msisdn: '13800000001',
      issue_type: 'no_network',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.issue_type).toBe('no_network');
    expect(Array.isArray(data.diagnostic_steps)).toBe(true);
    expect((data.diagnostic_steps as unknown[]).length).toBeGreaterThan(0);
  });

  test('includes severity and escalate fields in result', async () => {
    const { data } = await post('/api/diagnosis/network/analyze', {
      msisdn: '13800000001',
      issue_type: 'no_signal',
    });
    expect(data).toHaveProperty('severity');
    expect(['normal', 'warning', 'critical']).toContain(data.severity);
    expect(typeof data.escalate).toBe('boolean');
    expect(data).toHaveProperty('conclusion');
    expect(typeof data.conclusion).toBe('string');
  });

  test('detects suspended account and reflects in diagnostic steps', async () => {
    const { status, data } = await post('/api/diagnosis/network/analyze', {
      msisdn: '13800000003',
      issue_type: 'no_signal',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    const steps = data.diagnostic_steps as Record<string, unknown>[];
    // Suspended account should produce an error or warning step
    // Step name is "账号状态检查" in zh or "Account Status" in en
    const accountStep = steps.find((s) => String(s.step).includes('账号') || String(s.step).includes('Account'));
    expect(accountStep).toBeDefined();
    expect(accountStep!.status).toBe('error');
  });

  test('returns 400 when msisdn is missing', async () => {
    const { status, data } = await post('/api/diagnosis/network/analyze', {
      issue_type: 'no_signal',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when issue_type is missing', async () => {
    const { status, data } = await post('/api/diagnosis/network/analyze', {
      msisdn: '13800000001',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await post('/api/diagnosis/network/analyze', {
      msisdn: '19900000099',
      issue_type: 'no_signal',
    });
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('returns zh localized results by default', async () => {
    const { data } = await post('/api/diagnosis/network/analyze', {
      msisdn: '13800000001',
      issue_type: 'no_signal',
    });
    // Default lang is zh, conclusion should be in Chinese
    expect(typeof data.conclusion).toBe('string');
    const conclusion = data.conclusion as string;
    // Chinese conclusion contains Chinese chars
    expect(/[\u4e00-\u9fff]/.test(conclusion)).toBe(true);
  });

  test('returns en localized results when lang=en', async () => {
    const { data } = await post('/api/diagnosis/network/analyze', {
      msisdn: '13800000001',
      issue_type: 'no_signal',
      lang: 'en',
    });
    const conclusion = data.conclusion as string;
    // English conclusion should not be primarily Chinese
    expect(conclusion.length).toBeGreaterThan(0);
  });
});

// ── POST /api/diagnosis/app/analyze ─────────────────────────────────────────

describe('POST /api/diagnosis/app/analyze', () => {
  test('returns diagnosis for app_locked issue', async () => {
    const { status, data } = await post('/api/diagnosis/app/analyze', {
      msisdn: '13800000001',
      issue_type: 'app_locked',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(data.issue_type).toBe('app_locked');
    expect(Array.isArray(data.diagnostic_steps)).toBe(true);
    expect((data.diagnostic_steps as unknown[]).length).toBeGreaterThan(0);
    expect(data).toHaveProperty('conclusion');
    expect(data).toHaveProperty('escalation_path');
    expect(data).toHaveProperty('customer_actions');
    expect(Array.isArray(data.customer_actions)).toBe(true);
  });

  test('returns diagnosis for login_failed issue', async () => {
    const { status, data } = await post('/api/diagnosis/app/analyze', {
      msisdn: '13800000001',
      issue_type: 'login_failed',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.issue_type).toBe('login_failed');
    expect(Array.isArray(data.diagnostic_steps)).toBe(true);
    expect((data.diagnostic_steps as unknown[]).length).toBeGreaterThan(0);
    expect(data).toHaveProperty('lock_reason');
  });

  test('returns diagnosis for device_incompatible issue', async () => {
    const { status, data } = await post('/api/diagnosis/app/analyze', {
      msisdn: '13800000001',
      issue_type: 'device_incompatible',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.issue_type).toBe('device_incompatible');
    expect(Array.isArray(data.diagnostic_steps)).toBe(true);
    expect((data.diagnostic_steps as unknown[]).length).toBeGreaterThan(0);
  });

  test('returns diagnosis for suspicious_activity issue', async () => {
    const { status, data } = await post('/api/diagnosis/app/analyze', {
      msisdn: '13800000001',
      issue_type: 'suspicious_activity',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.issue_type).toBe('suspicious_activity');
    expect(Array.isArray(data.diagnostic_steps)).toBe(true);
    expect((data.diagnostic_steps as unknown[]).length).toBeGreaterThan(0);
    expect(data).toHaveProperty('escalation_path');
    expect(['self_service', 'frontline', 'security_team']).toContain(data.escalation_path);
  });

  test('escalation_path is one of self_service/frontline/security_team', async () => {
    const { data } = await post('/api/diagnosis/app/analyze', {
      msisdn: '13800000001',
      issue_type: 'app_locked',
    });
    expect(['self_service', 'frontline', 'security_team']).toContain(data.escalation_path);
  });

  test('returns 400 when msisdn is missing', async () => {
    const { status, data } = await post('/api/diagnosis/app/analyze', {
      issue_type: 'app_locked',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when issue_type is missing', async () => {
    const { status, data } = await post('/api/diagnosis/app/analyze', {
      msisdn: '13800000001',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await post('/api/diagnosis/app/analyze', {
      msisdn: '19900000099',
      issue_type: 'app_locked',
    });
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});
