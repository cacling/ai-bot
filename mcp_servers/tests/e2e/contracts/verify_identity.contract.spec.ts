/**
 * Tool Contract: verify_identity
 * Server: account-service (:18007)
 * Input:  { phone: string, otp: string }  (required: [phone, otp])
 * Output: packages/shared-db/src/schemas/verify_identity.json
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import { type Client } from '@modelcontextprotocol/sdk/client/index.js';

const SERVICE_PATH = 'src/services/account_service.ts';
const TOOL = 'verify_identity';
const PHONE = '13800000001';

let client: Client;

beforeAll(async () => {
  mockBackend({
    post: (path, body) => {
      if (path === '/api/identity/verify') {
        const { phone, otp } = body as { phone: string; otp: string };
        if (phone === PHONE && otp === '123456') {
          return { success: true, verified: true, customer_name: '张三' };
        }
        return { success: true, verified: false, message: '验证码错误' };
      }
      return { success: false, message: 'not mocked' };
    },
  });
  const factory = await loadService(SERVICE_PATH);
  client = await createTestClient(factory);
});

afterAll(async () => {
  await client.close();
});

describe('verify_identity — schema validation (success)', () => {
  test('success response passes schema validation', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE, otp: '123456' });
    const errors = validateSchema(TOOL, result);
    expect(errors).toEqual([]);
  });

  test('verified is true on success', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE, otp: '123456' });
    expect(result.verified).toBe(true);
  });

  test('customer_name is string on success', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE, otp: '123456' });
    expect(typeof result.customer_name).toBe('string');
    expect(result.customer_name).toBe('张三');
  });
});

describe('verify_identity — schema validation (failure)', () => {
  test('failure response passes schema validation', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE, otp: 'wrong' });
    const errors = validateSchema(TOOL, result);
    expect(errors).toEqual([]);
  });

  test('verified is false on failure', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE, otp: 'wrong' });
    expect(result.verified).toBe(false);
  });

  test('customer_name is null on failure', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE, otp: 'wrong' });
    expect(result.customer_name).toBeNull();
  });
});

describe('verify_identity — enum fields', () => {
  test('verification_method is "otp"', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE, otp: '123456' });
    expect(result.verification_method).toBe('otp');
  });

  test('verification_method is "otp" even on failure', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE, otp: 'wrong' });
    expect(result.verification_method).toBe('otp');
  });
});
