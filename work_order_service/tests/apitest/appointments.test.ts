/**
 * API tests for: appointments routes
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();

async function get(path: string) {
  const res = await app.request(path);
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

/** Helper: create a work order and return its id */
async function createWorkOrder() {
  const { data } = await post('/api/work-orders', {
    title: '预约测试父工单',
    customer_phone: '13800000001',
    work_type: 'followup',
    execution_mode: 'manual',
  });
  return data.id as string;
}

describe('POST /api/work-orders/:id/appointments', () => {
  test('returns 400 when appointment_type is missing', async () => {
    const parentId = await createWorkOrder();
    const { status, data } = await post(`/api/work-orders/${parentId}/appointments`, {});
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  test('creates appointment and pushes parent to scheduled', async () => {
    const parentId = await createWorkOrder();
    // Accept parent first so it's in 'open' state
    await post(`/api/work-orders/${parentId}/transition`, { action: 'accept' });

    const { status, data } = await post(`/api/work-orders/${parentId}/appointments`, {
      appointment_type: 'callback',
      scheduled_start_at: '2026-03-29T15:00:00+08:00',
      scheduled_end_at: '2026-03-29T15:30:00+08:00',
      location_text: '电话回访',
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);

    // Verify parent is now scheduled
    const { data: parentDetail } = await get(`/api/work-orders/${parentId}`);
    expect(parentDetail.status).toBe('scheduled');
  });
});

describe('Appointment full lifecycle: confirm → check_in → start → complete', () => {
  test('drives parent work order through scheduled → in_progress → waiting_verification', async () => {
    const parentId = await createWorkOrder();
    await post(`/api/work-orders/${parentId}/transition`, { action: 'accept' });

    // Create appointment
    const { data: apt } = await post(`/api/work-orders/${parentId}/appointments`, {
      appointment_type: 'callback',
      scheduled_start_at: '2026-03-29T15:00:00+08:00',
    });
    const aptId = apt.id as string;

    // Confirm → parent stays scheduled
    const { status: s1 } = await post(`/api/appointments/${aptId}/confirm`, {
      resource_id: 'agent_001',
    });
    expect(s1).toBe(200);
    const { data: p1 } = await get(`/api/work-orders/${parentId}`);
    expect(p1.status).toBe('scheduled');

    // Check-in → parent goes to in_progress
    const { status: s2 } = await post(`/api/appointments/${aptId}/check-in`, {});
    expect(s2).toBe(200);
    const { data: p2 } = await get(`/api/work-orders/${parentId}`);
    expect(p2.status).toBe('in_progress');

    // Start (checked_in → in_service) → parent stays in_progress
    const { status: s3 } = await post(`/api/appointments/${aptId}/start`, {});
    expect(s3).toBe(200);

    // Complete → parent goes to waiting_verification
    const { status: s4 } = await post(`/api/appointments/${aptId}/complete`, {});
    expect(s4).toBe(200);
    const { data: p4 } = await get(`/api/work-orders/${parentId}`);
    expect(p4.status).toBe('waiting_verification');
  });
});

describe('Appointment reschedule flow', () => {
  test('confirm → reschedule → confirm again', async () => {
    const parentId = await createWorkOrder();

    const { data: apt } = await post(`/api/work-orders/${parentId}/appointments`, {
      appointment_type: 'store_visit',
      scheduled_start_at: '2026-03-30T10:00:00+08:00',
    });
    const aptId = apt.id as string;

    const { status: s1 } = await post(`/api/appointments/${aptId}/confirm`, {});
    expect(s1).toBe(200);

    const { status: s2 } = await post(`/api/appointments/${aptId}/reschedule`, {
      scheduled_start_at: '2026-03-31T10:00:00+08:00',
      reason: 'customer_request',
    });
    expect(s2).toBe(200);

    const { status: s3 } = await post(`/api/appointments/${aptId}/confirm`, {});
    expect(s3).toBe(200);
  });
});

describe('Appointment no_show drives parent to waiting_customer', () => {
  test('confirm → no_show → parent waiting_customer', async () => {
    const parentId = await createWorkOrder();
    await post(`/api/work-orders/${parentId}/transition`, { action: 'accept' });

    const { data: apt } = await post(`/api/work-orders/${parentId}/appointments`, {
      appointment_type: 'callback',
      scheduled_start_at: '2026-03-29T15:00:00+08:00',
    });
    const aptId = apt.id as string;

    await post(`/api/appointments/${aptId}/confirm`, {});

    const { status } = await post(`/api/appointments/${aptId}/no-show`, {
      reason: 'customer_not_reachable',
    });
    expect(status).toBe(200);

    // Verify parent is now waiting_customer
    const { data: parentDetail } = await get(`/api/work-orders/${parentId}`);
    expect(parentDetail.status).toBe('waiting_customer');
  });
});

describe('Appointment cancel drives parent back to open', () => {
  test('proposed → cancel → parent open', async () => {
    const parentId = await createWorkOrder();
    await post(`/api/work-orders/${parentId}/transition`, { action: 'accept' });

    const { data: apt } = await post(`/api/work-orders/${parentId}/appointments`, {
      appointment_type: 'onsite',
      scheduled_start_at: '2026-03-30T14:00:00+08:00',
    });
    const aptId = apt.id as string;

    const { status } = await post(`/api/appointments/${aptId}/cancel`, {});
    expect(status).toBe(200);

    const { data: parentDetail } = await get(`/api/work-orders/${parentId}`);
    expect(parentDetail.status).toBe('open');
  });
});

describe('Aggregated detail includes appointment detail', () => {
  test('GET /api/work-items/:id returns child appointments with detail', async () => {
    const parentId = await createWorkOrder();

    const { data: apt } = await post(`/api/work-orders/${parentId}/appointments`, {
      appointment_type: 'callback',
      scheduled_start_at: '2026-03-29T15:00:00+08:00',
      location_text: '电话回访',
    });

    const { status, data } = await get(`/api/work-items/${parentId}`);
    expect(status).toBe(200);

    const appts = data.appointments as Array<Record<string, unknown>>;
    expect(appts.length).toBeGreaterThanOrEqual(1);

    // Verify detail is joined (has booking_status, scheduled_start_at)
    const found = appts.find(a => a.id === apt.id);
    expect(found).toBeDefined();
    const detail = found!.detail as Record<string, unknown>;
    expect(detail).not.toBeNull();
    expect(detail.booking_status).toBe('proposed');
    expect(detail.scheduled_start_at).toBe('2026-03-29T15:00:00+08:00');
    expect(detail.location_text).toBe('电话回访');
  });
});
