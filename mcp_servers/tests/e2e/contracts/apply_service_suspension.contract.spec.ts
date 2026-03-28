/**
 * Tool Contract: apply_service_suspension
 * Server: account-service (:18007)
 * Input:  { phone: string }  (required: [phone])
 * Output: packages/shared-db/src/schemas/apply_service_suspension.json
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import { type Client } from '@modelcontextprotocol/sdk/client/index.js';

const SERVICE_PATH = 'src/services/account_service.ts';
const TOOL = 'apply_service_suspension';
const PHONE = '13800000001';

let client: Client;

beforeAll(async () => {
  mockBackend({
    get: (path) => {
      if (path === `/api/customer/subscribers/${PHONE}`) {
        return { success: true, name: '张三' };
      }
      // Unknown phone returns not found
      return { success: false };
    },
  });
  const factory = await loadService(SERVICE_PATH);
  client = await createTestClient(factory);
});

afterAll(async () => {
  await client.close();
});

describe('apply_service_suspension — schema validation (success)', () => {
  test('success response passes schema validation', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    const errors = validateSchema(TOOL, result);
    expect(errors).toEqual([]);
  });
});

describe('apply_service_suspension — required fields', () => {
  test('success is a boolean', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    expect(typeof result.success).toBe('boolean');
    expect(result.success).toBe(true);
  });

  test('message is a string', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    expect(typeof result.message).toBe('string');
    expect((result.message as string).length).toBeGreaterThan(0);
  });
});

describe('apply_service_suspension — optional fields on success', () => {
  test('phone is a string', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    expect(result.phone).toBe(PHONE);
  });

  test('suspension_type is enum: temporary|permanent', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    expect(['temporary', 'permanent']).toContain(result.suspension_type);
  });

  test('effective_date is a date string', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    expect(typeof result.effective_date).toBe('string');
    // Verify YYYY-MM-DD format
    expect(result.effective_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('resume_deadline is a date string', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    expect(typeof result.resume_deadline).toBe('string');
    expect(result.resume_deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('monthly_fee is a number', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    expect(typeof result.monthly_fee).toBe('number');
    expect(result.monthly_fee).toBe(5.00);
  });
});

describe('apply_service_suspension — failure case', () => {
  test('unknown phone returns success:false with message', async () => {
    const result = await callTool(client, TOOL, { phone: '00000000000' });
    expect(result.success).toBe(false);
    expect(typeof result.message).toBe('string');
    expect((result.message as string).length).toBeGreaterThan(0);
  });

  test('failure response passes schema validation', async () => {
    const result = await callTool(client, TOOL, { phone: '00000000000' });
    const errors = validateSchema(TOOL, result);
    expect(errors).toEqual([]);
  });
});
