/**
 * Tool Contract: query_bill
 * Server: user-info-service (:18003)
 * Input:  { phone: string, month?: string }
 * Output: packages/shared-db/src/schemas/query_bill.json
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  mockBackend({
    get: (path: string) => {
      if (path.includes('/bills/2026-02')) {
        return {
          success: true,
          bill: {
            id: 101,
            phone: '13800000001',
            month: '2026-02',
            total: 128.5,
            plan_fee: 99,
            data_fee: 10,
            voice_fee: 5.5,
            value_added_fee: 12,
            sms_fee: 0,
            tax: 2,
            status: 'unpaid',
            items: [],
          },
        };
      }
      if (path.includes('/bills?limit=3')) {
        return {
          success: true,
          bills: [
            {
              id: 101,
              phone: '13800000001',
              month: '2026-02',
              total: 128.5,
              plan_fee: 99,
              data_fee: 10,
              voice_fee: 5.5,
              value_added_fee: 12,
              sms_fee: 0,
              tax: 2,
              status: 'unpaid',
              items: [],
            },
            {
              id: 100,
              phone: '13800000001',
              month: '2026-01',
              total: 99,
              plan_fee: 99,
              data_fee: 0,
              voice_fee: 0,
              value_added_fee: 0,
              sms_fee: 0,
              tax: 0,
              status: 'paid',
              items: [],
            },
          ],
        };
      }
      return { success: false };
    },
  });

  const createServer = await loadService('src/services/user_info_service.ts');
  client = await createTestClient(createServer);
});

describe('query_bill contract', () => {
  test('output conforms to schema (single month)', async () => {
    const res = await callTool(client, 'query_bill', { phone: '13800000001', month: '2026-02' });
    const errors = validateSchema('query_bill', res);
    expect(errors).toEqual([]);
  });

  test('required fields are present', async () => {
    const res = await callTool(client, 'query_bill', { phone: '13800000001', month: '2026-02' });
    expect(typeof res.count).toBe('number');
    expect(Array.isArray(res.bills)).toBe(true);
  });

  test('bill item has breakdown array', async () => {
    const res = await callTool(client, 'query_bill', { phone: '13800000001', month: '2026-02' });
    const bills = res.bills as Array<Record<string, unknown>>;
    expect(bills.length).toBe(1);
    const bill = bills[0];
    const breakdown = bill.breakdown as Array<Record<string, unknown>>;
    expect(Array.isArray(breakdown)).toBe(true);
    expect(breakdown.length).toBeGreaterThan(0);
  });

  test('breakdown items have item, amount, ratio', async () => {
    const res = await callTool(client, 'query_bill', { phone: '13800000001', month: '2026-02' });
    const bills = res.bills as Array<Record<string, unknown>>;
    const breakdown = bills[0].breakdown as Array<Record<string, unknown>>;
    for (const entry of breakdown) {
      expect(typeof entry.item).toBe('string');
      expect(typeof entry.amount).toBe('number');
      expect(typeof entry.ratio).toBe('number');
    }
  });

  test('bill status enum is valid', async () => {
    const res = await callTool(client, 'query_bill', { phone: '13800000001', month: '2026-02' });
    const bills = res.bills as Array<Record<string, unknown>>;
    for (const bill of bills) {
      expect(['paid', 'unpaid', 'overdue']).toContain(bill.status);
    }
  });

  test('payable is boolean matching unpaid status', async () => {
    const res = await callTool(client, 'query_bill', { phone: '13800000001', month: '2026-02' });
    const bills = res.bills as Array<Record<string, unknown>>;
    const bill = bills[0];
    expect(typeof bill.payable).toBe('boolean');
    expect(bill.payable).toBe(bill.status === 'unpaid');
  });

  test('multi-month query conforms to schema', async () => {
    const res = await callTool(client, 'query_bill', { phone: '13800000001' });
    const errors = validateSchema('query_bill', res);
    expect(errors).toEqual([]);
    expect(res.count).toBe(2);
  });
});
