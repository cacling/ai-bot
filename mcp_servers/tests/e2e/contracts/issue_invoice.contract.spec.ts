/**
 * Tool Contract: issue_invoice
 * Server: business-service (:18004)
 * Input:  { phone: string, month: string, email: string, operator?: string, traceId?: string }
 * Output: packages/shared-db/src/schemas/issue_invoice.json
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  mockBackend({
    post: (path: string, body: unknown) => {
      if (path === '/api/invoice/issue') {
        const { phone, month, email } = body as { phone: string; month: string; email: string };
        return {
          success: true,
          invoice_no: 'INV-2026-0001',
          total: 128.5,
          email,
          status: 'issued',
        };
      }
      return { success: false };
    },
  });

  const createServer = await loadService('src/services/business_service.ts');
  client = await createTestClient(createServer);
});

describe('issue_invoice contract', () => {
  test('output conforms to schema', async () => {
    const res = await callTool(client, 'issue_invoice', {
      phone: '13800000001',
      month: '2026-02',
      email: 'user@example.com',
    });
    const errors = validateSchema('issue_invoice', res);
    expect(errors).toEqual([]);
  });

  test('required field total is a number', async () => {
    const res = await callTool(client, 'issue_invoice', {
      phone: '13800000001',
      month: '2026-02',
      email: 'user@example.com',
    });
    expect(typeof res.total).toBe('number');
    expect(res.total).toBe(128.5);
  });

  test('optional nullable fields accept string or null', async () => {
    const res = await callTool(client, 'issue_invoice', {
      phone: '13800000001',
      month: '2026-02',
      email: 'user@example.com',
    });
    for (const field of ['invoice_no', 'phone', 'month', 'email', 'status']) {
      const val = res[field];
      expect(val === null || typeof val === 'string').toBe(true);
    }
  });

  test('invoice_no is present on success', async () => {
    const res = await callTool(client, 'issue_invoice', {
      phone: '13800000001',
      month: '2026-02',
      email: 'user@example.com',
    });
    expect(typeof res.invoice_no).toBe('string');
    expect((res.invoice_no as string).length).toBeGreaterThan(0);
  });

  test('phone and month echo back input values', async () => {
    const res = await callTool(client, 'issue_invoice', {
      phone: '13800000001',
      month: '2026-02',
      email: 'user@example.com',
    });
    expect(res.phone).toBe('13800000001');
    expect(res.month).toBe('2026-02');
  });
});
