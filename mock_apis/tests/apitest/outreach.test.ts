/**
 * API tests for: src/routes/outreach.ts
 * Mount: /api/outreach
 * Routes: POST calls/result, POST sms/send, POST handoff/create, POST marketing/result
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();

// Small delay to avoid Date.now() collision in ID generation across rapid inserts
const tick = () => new Promise((r) => setTimeout(r, 5));

async function post(path: string, body: Record<string, unknown>) {
  await tick();
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

// ── POST /api/outreach/calls/result ─────────────────────────────────────────

describe('POST /api/outreach/calls/result', () => {
  test('records call result and returns result_id + next_action', async () => {
    const { status, data } = await post('/api/outreach/calls/result', {
      phone: '13800000001',
      result: 'answered',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.result_id).toBe('string');
    expect((data.result_id as string).startsWith('CALL-')).toBe(true);
    expect(typeof data.next_action).toBe('string');
  });

  test('returns callback next_action when result is callback', async () => {
    const { data } = await post('/api/outreach/calls/result', {
      phone: '13800000001',
      result: 'callback',
    });
    expect(data.success).toBe(true);
    expect(data.next_action).toContain('回拨');
  });

  test('returns ptp next_action when result is ptp', async () => {
    const { data } = await post('/api/outreach/calls/result', {
      phone: '13800000001',
      result: 'ptp',
    });
    expect(data.success).toBe(true);
    expect(data.next_action).toContain('短信');
  });

  test('accepts optional task_id, remark, callback_time, ptp_date', async () => {
    const { status, data } = await post('/api/outreach/calls/result', {
      phone: '13800000001',
      result: 'callback',
      task_id: 'TASK-001',
      remark: 'Customer requested morning callback',
      callback_time: '2026-03-27T10:00:00+08:00',
      ptp_date: '2026-03-28',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.result_id).toBe('string');
  });

  test('returns 400 when phone is missing', async () => {
    const { status, data } = await post('/api/outreach/calls/result', {
      result: 'answered',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when result is missing', async () => {
    const { status, data } = await post('/api/outreach/calls/result', {
      phone: '13800000001',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });
});

// ── POST /api/outreach/sms/send ─────────────────────────────────────────────

describe('POST /api/outreach/sms/send', () => {
  test('sends SMS and returns status=sent', async () => {
    const { status, data } = await post('/api/outreach/sms/send', {
      phone: '13800000001',
      sms_type: 'payment_link',
    });
    expect(status).toBe(200);
    expect(typeof data.event_id).toBe('string');
    expect((data.event_id as string).startsWith('SMS-')).toBe(true);
    expect(data.status).toBe('sent');
  });

  test('blocks SMS during quiet hours (21:00-08:00)', async () => {
    // 22:00 Beijing time = 14:00 UTC
    const { data } = await post('/api/outreach/sms/send', {
      phone: '13800000001',
      sms_type: 'callback_reminder',
      send_at: '2026-03-26T14:00:00Z',
    });
    expect(data.status).toBe('blocked');
    expect(data.reason).toBe('quiet_hours');
  });

  test('allows SMS outside quiet hours', async () => {
    // 10:00 Beijing time = 02:00 UTC
    const { data } = await post('/api/outreach/sms/send', {
      phone: '13800000001',
      sms_type: 'plan_detail',
      send_at: '2026-03-26T02:00:00Z',
    });
    expect(data.status).toBe('sent');
  });

  test('returns 400 when phone is missing', async () => {
    const { status, data } = await post('/api/outreach/sms/send', {
      sms_type: 'payment_link',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when sms_type is missing', async () => {
    const { status, data } = await post('/api/outreach/sms/send', {
      phone: '13800000001',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });
});

// ── POST /api/outreach/handoff/create ───────────────────────────────────────

describe('POST /api/outreach/handoff/create', () => {
  test('creates handoff case and returns case_id', async () => {
    const { status, data } = await post('/api/outreach/handoff/create', {
      phone: '13800000001',
      source_skill: 'billing-inquiry',
      reason: 'Customer demands supervisor',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.case_id).toBe('string');
    expect((data.case_id as string).startsWith('HOF-')).toBe(true);
    expect(data.status).toBe('open');
    expect(typeof data.queue_name).toBe('string');
  });

  test('defaults queue_name to general_support', async () => {
    const { data } = await post('/api/outreach/handoff/create', {
      phone: '13800000001',
      source_skill: 'network-diagnosis',
      reason: 'Unresolved issue',
    });
    expect(data.queue_name).toBe('general_support');
  });

  test('accepts optional priority and queue_name', async () => {
    const { status, data } = await post('/api/outreach/handoff/create', {
      phone: '13800000001',
      source_skill: 'billing-inquiry',
      reason: 'Urgent billing dispute',
      priority: 'high',
      queue_name: 'billing_support',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('returns 400 when phone is missing', async () => {
    const { status, data } = await post('/api/outreach/handoff/create', {
      source_skill: 'billing-inquiry',
      reason: 'Some reason',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when source_skill is missing', async () => {
    const { status, data } = await post('/api/outreach/handoff/create', {
      phone: '13800000001',
      reason: 'Some reason',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when reason is missing', async () => {
    const { status, data } = await post('/api/outreach/handoff/create', {
      phone: '13800000001',
      source_skill: 'billing-inquiry',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });
});

// ── POST /api/outreach/marketing/result ─────────────────────────────────────

describe('POST /api/outreach/marketing/result', () => {
  test('records marketing result and returns record_id', async () => {
    const { status, data } = await post('/api/outreach/marketing/result', {
      campaign_id: 'CAMP-001',
      phone: '13800000001',
      result: 'interested',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.record_id).toBe('string');
    expect((data.record_id as string).startsWith('MKT-')).toBe(true);
    expect(typeof data.is_dnd).toBe('boolean');
    expect(typeof data.followup).toBe('string');
  });

  test('marks is_dnd=true when result is dnd', async () => {
    const { data } = await post('/api/outreach/marketing/result', {
      campaign_id: 'CAMP-002',
      phone: '13800000001',
      result: 'dnd',
    });
    expect(data.success).toBe(true);
    expect(data.is_dnd).toBe(true);
    expect(data.followup).toContain('免打扰');
  });

  test('returns callback followup when result is callback', async () => {
    const { data } = await post('/api/outreach/marketing/result', {
      campaign_id: 'CAMP-003',
      phone: '13800000001',
      result: 'callback',
      callback_time: '2026-03-27T14:00:00+08:00',
    });
    expect(data.success).toBe(true);
    expect(data.followup).toContain('回拨');
  });

  test('returns 400 when campaign_id is missing', async () => {
    const { status, data } = await post('/api/outreach/marketing/result', {
      phone: '13800000001',
      result: 'interested',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when phone is missing', async () => {
    const { status, data } = await post('/api/outreach/marketing/result', {
      campaign_id: 'CAMP-001',
      result: 'interested',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when result is missing', async () => {
    const { status, data } = await post('/api/outreach/marketing/result', {
      campaign_id: 'CAMP-001',
      phone: '13800000001',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });
});
