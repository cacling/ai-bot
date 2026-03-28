/**
 * API tests for: src/routes/orders.ts
 * Mount: /api/orders
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

describe('POST /api/orders/service-cancel', () => {
  test('returns 400 when phone is missing', async () => {
    const { status, data } = await post('/api/orders/service-cancel', { service_id: 'video_pkg' });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when service_id is missing', async () => {
    const { status, data } = await post('/api/orders/service-cancel', { phone: '13800000001' });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await post('/api/orders/service-cancel', {
      phone: '19900000099',
      service_id: 'video_pkg',
    });
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('returns 404 when service is not subscribed', async () => {
    const { status, data } = await post('/api/orders/service-cancel', {
      phone: '13800000002',
      service_id: 'sms_100',
    });
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('cancels subscribed service and returns order details', async () => {
    const { status, data } = await post('/api/orders/service-cancel', {
      phone: '13800000001',
      service_id: 'video_pkg',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.order_id).toBeDefined();
    expect(typeof data.order_id).toBe('string');
    expect((data.order_id as string).startsWith('ORD-')).toBe(true);
    expect(data.phone).toBe('13800000001');
    expect(data.service_id).toBe('video_pkg');
    expect(data.service_name).toBeDefined();
    expect(typeof data.monthly_fee).toBe('number');
    expect(data.status).toBe('pending_effective');
    expect(typeof data.refund_eligible).toBe('boolean');
    expect(data.requires_manual_review).toBe(false);
    expect(data.message).toBeDefined();
  });

  test('sets requires_manual_review for non-active subscriber', async () => {
    const { status, data } = await post('/api/orders/service-cancel', {
      phone: '13800000003',
      service_id: 'game_pkg',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.requires_manual_review).toBe(true);
  });

  test('created order can be retrieved by order_id', async () => {
    const cancelRes = await post('/api/orders/service-cancel', {
      phone: '13800000001',
      service_id: 'sms_100',
    });
    expect(cancelRes.status).toBe(200);
    const orderId = cancelRes.data.order_id as string;

    const { status, data } = await get(`/api/orders/${orderId}`);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    const order = data.order as Record<string, unknown>;
    expect(order.order_id).toBe(orderId);
    expect(order.order_type).toBe('service_cancel');
    expect(order.phone).toBe('13800000001');
  });
});

describe('GET /api/orders/refund-requests', () => {
  test('returns 400 when msisdn is missing', async () => {
    const { status, data } = await get('/api/orders/refund-requests');
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/orders/refund-requests?msisdn=19900000099');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('returns refund requests for valid phone', async () => {
    const { status, data } = await get('/api/orders/refund-requests?msisdn=13800000001');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(typeof data.count).toBe('number');
    expect(Array.isArray(data.refund_requests)).toBe(true);
  });
});

describe('GET /api/orders/refund-requests/:refundId', () => {
  test('returns refund request detail for known refund', async () => {
    const { status, data } = await get('/api/orders/refund-requests/REF-001');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    const req = data.refund_request as Record<string, unknown>;
    expect(req.refund_id).toBe('REF-001');
    expect(req.phone).toBe('13800000001');
  });

  test('returns 404 for non-existent refundId', async () => {
    const { status, data } = await get('/api/orders/refund-requests/REF-NONEXISTENT');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});

describe('GET /api/orders/:orderId', () => {
  test('returns 404 for non-existent orderId', async () => {
    const { status, data } = await get('/api/orders/ORD-NONEXISTENT');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});
