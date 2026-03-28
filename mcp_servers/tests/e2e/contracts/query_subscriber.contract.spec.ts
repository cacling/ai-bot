/**
 * Tool Contract: query_subscriber
 * Server: user-info-service (:18003)
 * Input:  { phone: string }
 * Output: packages/shared-db/src/schemas/query_subscriber.json
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  mockBackend({
    get: (path: string) => {
      if (path.endsWith('/services')) {
        return {
          success: true,
          services: [
            {
              service_id: 'video_pkg',
              name: '视频会员包',
              monthly_fee: 15,
              subscribed_at: '2026-01-10',
              effective_start: '2026-01-10',
              effective_end: null,
              auto_renew: true,
              order_id: 'ORD001',
            },
            {
              service_id: 'sms_100',
              name: '100条短信包',
              monthly_fee: 5,
              subscribed_at: '2026-02-01',
              effective_start: '2026-02-01',
              effective_end: '2026-12-31',
              auto_renew: false,
              order_id: 'ORD002',
            },
          ],
        };
      }
      if (path.includes('/subscribers/13800000001')) {
        return {
          success: true,
          subscriber: {
            msisdn: '13800000001',
            name: '张三',
            gender: 'male',
            status: 'active',
            balance: 56.8,
            overdue_days: 0,
            data_used_gb: 8.5,
            voice_used_min: 120,
            plan: {
              name: '畅享套餐',
              plan_type: 'postpaid',
              monthly_fee: 99,
              data_gb: 20,
              voice_min: 500,
            },
          },
        };
      }
      // not-found subscriber
      return { success: false };
    },
  });

  const createServer = await loadService('src/services/user_info_service.ts');
  client = await createTestClient(createServer);
});

describe('query_subscriber contract', () => {
  test('output conforms to schema (active subscriber)', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13800000001' });
    const errors = validateSchema('query_subscriber', res);
    expect(errors).toEqual([]);
  });

  test('required fields are present with correct types', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13800000001' });
    expect(typeof res.balance).toBe('number');
    expect(typeof res.is_arrears).toBe('boolean');
    expect(typeof res.overdue_days).toBe('number');
    expect(Array.isArray(res.services)).toBe(true);
    expect(typeof res.vas_total_fee).toBe('number');
  });

  test('status enum is valid', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13800000001' });
    expect(['active', 'suspended', 'cancelled']).toContain(res.status);
  });

  test('arrears_level enum is valid', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13800000001' });
    expect(['none', 'normal', 'pre_cancel', 'recycled']).toContain(res.arrears_level);
  });

  test('services array items have expected structure', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13800000001' });
    const services = res.services as Array<Record<string, unknown>>;
    expect(services.length).toBeGreaterThan(0);
    for (const svc of services) {
      expect(typeof svc.service_id).toBe('string');
      expect(typeof svc.name).toBe('string');
      expect(typeof svc.monthly_fee).toBe('number');
    }
  });

  test('vas_total_fee equals sum of service monthly fees', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13800000001' });
    const services = res.services as Array<Record<string, unknown>>;
    const expectedFee = services.reduce((sum: number, s) => sum + (s.monthly_fee as number), 0);
    expect(res.vas_total_fee).toBe(expectedFee);
  });

  test('not-found subscriber still validates schema', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13899999999' });
    const errors = validateSchema('query_subscriber', res);
    expect(errors).toEqual([]);
  });

  test('not-found subscriber has zero balance and empty services', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13899999999' });
    expect(res.balance).toBe(0);
    expect(res.is_arrears).toBe(false);
    expect((res.services as unknown[]).length).toBe(0);
    expect(res.vas_total_fee).toBe(0);
  });
});
