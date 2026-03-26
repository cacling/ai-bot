/**
 * Tool Contract: cancel_service
 * Server: business-service (:18004)
 * Input:  { phone: string, service_id: string, operator?: string, reason?: string, traceId?: string, idempotencyKey?: string }
 * Output: packages/shared-db/src/schemas/cancel_service.json
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  mockBackend({
    post: (path: string, body: unknown) => {
      if (path === '/api/orders/service-cancel') {
        const { phone, service_id } = body as { phone: string; service_id: string };
        return {
          success: true,
          order_id: 'ORD-CANCEL-001',
          phone,
          service_id,
          service_name: '视频会员包',
          monthly_fee: 15,
          status: 'cancelled',
          effective_at: '2026-03-31',
          refund_eligible: false,
          refund_note: '当月费用不退，次月起不再扣费。',
        };
      }
      return { success: false };
    },
  });

  const createServer = await loadService('src/services/business_service.ts');
  client = await createTestClient(createServer);
});

describe('cancel_service contract', () => {
  test('output conforms to schema', async () => {
    const res = await callTool(client, 'cancel_service', { phone: '13800000001', service_id: 'video_pkg' });
    const errors = validateSchema('cancel_service', res);
    expect(errors).toEqual([]);
  });

  test('required fields are present with correct types', async () => {
    const res = await callTool(client, 'cancel_service', { phone: '13800000001', service_id: 'video_pkg' });
    expect(typeof res.monthly_fee).toBe('number');
    expect(typeof res.refund_eligible).toBe('boolean');
  });

  test('optional nullable fields accept string or null', async () => {
    const res = await callTool(client, 'cancel_service', { phone: '13800000001', service_id: 'video_pkg' });
    for (const field of ['phone', 'service_id', 'service_name', 'effective_end', 'refund_note']) {
      const val = res[field];
      expect(val === null || typeof val === 'string').toBe(true);
    }
  });

  test('monthly_fee is a number', async () => {
    const res = await callTool(client, 'cancel_service', { phone: '13800000001', service_id: 'video_pkg' });
    expect(res.monthly_fee).toBe(15);
  });

  test('refund_eligible is boolean', async () => {
    const res = await callTool(client, 'cancel_service', { phone: '13800000001', service_id: 'video_pkg' });
    expect(res.refund_eligible).toBe(false);
  });
});
