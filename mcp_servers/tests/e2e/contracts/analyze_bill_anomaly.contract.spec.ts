/**
 * Tool Contract: analyze_bill_anomaly
 * Server: user-info-service (:18003)
 * Input:  { phone: string, month: string }
 * Output: packages/shared-db/src/schemas/analyze_bill_anomaly.json
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  mockBackend({
    post: (path: string, body: unknown) => {
      if (path === '/api/billing/anomaly/analyze') {
        const { msisdn } = body as { msisdn: string; month: string };
        if (msisdn === '13800000001') {
          return {
            success: true,
            current_total: 188.5,
            previous_total: 99,
            previous_month: '2026-01',
            diff: 89.5,
            change_ratio: 0.9,
            primary_cause: 'data_overage',
            causes: [
              {
                type: 'data_fee',
                item: '流量费',
                current_amount: 60,
                previous_amount: 0,
                diff: 60,
              },
              {
                type: 'value_added_fee',
                item: '增值业务费',
                current_amount: 30,
                previous_amount: 0,
                diff: 30,
              },
            ],
            item_details: [],
            summary: '本月流量超出套餐额度',
            changed_items_text: ['流量费增加60元', '增值业务费增加30元'],
          };
        }
        return { success: false, message: '未找到账单' };
      }
      return { success: false };
    },
  });

  const createServer = await loadService('src/services/user_info_service.ts');
  client = await createTestClient(createServer);
});

describe('analyze_bill_anomaly contract', () => {
  test('output conforms to schema (anomaly detected)', async () => {
    const res = await callTool(client, 'analyze_bill_anomaly', { phone: '13800000001', month: '2026-02' });
    const errors = validateSchema('analyze_bill_anomaly', res);
    expect(errors).toEqual([]);
  });

  test('required fields are present with correct types', async () => {
    const res = await callTool(client, 'analyze_bill_anomaly', { phone: '13800000001', month: '2026-02' });
    expect(typeof res.is_anomaly).toBe('boolean');
    expect(typeof res.current_month).toBe('string');
    expect(typeof res.previous_month).toBe('string');
    expect(typeof res.current_total).toBe('number');
    expect(typeof res.previous_total).toBe('number');
    expect(typeof res.diff).toBe('number');
    expect(typeof res.change_ratio).toBe('number');
    expect(typeof res.primary_cause).toBe('string');
    expect(Array.isArray(res.causes)).toBe(true);
    expect(typeof res.recommendation).toBe('string');
  });

  test('primary_cause enum is valid', async () => {
    const res = await callTool(client, 'analyze_bill_anomaly', { phone: '13800000001', month: '2026-02' });
    expect(['data_overage', 'voice_overage', 'new_vas', 'unknown']).toContain(res.primary_cause);
  });

  test('causes array items have expected structure', async () => {
    const res = await callTool(client, 'analyze_bill_anomaly', { phone: '13800000001', month: '2026-02' });
    const causes = res.causes as Array<Record<string, unknown>>;
    expect(causes.length).toBeGreaterThan(0);
    for (const cause of causes) {
      expect(typeof cause.type).toBe('string');
      expect(typeof cause.item).toBe('string');
      expect(typeof cause.current_amount).toBe('number');
      expect(typeof cause.previous_amount).toBe('number');
      expect(typeof cause.diff).toBe('number');
    }
  });

  test('is_anomaly true when change_ratio exceeds threshold', async () => {
    const res = await callTool(client, 'analyze_bill_anomaly', { phone: '13800000001', month: '2026-02' });
    expect(res.is_anomaly).toBe(true);
  });

  test('not-found subscriber still validates schema', async () => {
    const res = await callTool(client, 'analyze_bill_anomaly', { phone: '13899999999', month: '2026-02' });
    const errors = validateSchema('analyze_bill_anomaly', res);
    expect(errors).toEqual([]);
    expect(res.is_anomaly).toBe(false);
    expect(res.primary_cause).toBe('unknown');
  });
});
