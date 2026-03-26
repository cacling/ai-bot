/**
 * Tool Contract: check_contracts
 * Server: account-service (:18007)
 * Input:  { phone: string }  (required: [phone])
 * Output: packages/shared-db/src/schemas/check_contracts.json
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import { type Client } from '@modelcontextprotocol/sdk/client/index.js';

const SERVICE_PATH = 'src/services/account_service.ts';
const TOOL = 'check_contracts';
const PHONE = '13800000001';

const MOCK_CONTRACTS = [
  {
    contract_id: 'C20240101',
    name: '畅享冰淇淋套餐 24 个月合约',
    start_date: '2024-01-01',
    end_date: '2025-12-31',
    penalty: 200,
    risk_level: 'high',
    status: 'active',
  },
  {
    contract_id: 'C20230601',
    name: '宽带融合 12 个月合约',
    start_date: '2023-06-01',
    end_date: '2024-05-31',
    penalty: 0,
    risk_level: 'low',
    status: 'expired',
  },
];

let client: Client;

beforeAll(async () => {
  mockBackend({
    get: (path) => {
      if (path === `/api/customer/subscribers/${PHONE}/contracts`) {
        return { success: true, contracts: MOCK_CONTRACTS };
      }
      return { success: false, contracts: [] };
    },
  });
  const factory = await loadService(SERVICE_PATH);
  client = await createTestClient(factory);
});

afterAll(async () => {
  await client.close();
});

describe('check_contracts — schema validation', () => {
  test('response passes schema validation', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    const errors = validateSchema(TOOL, result);
    expect(errors).toEqual([]);
  });
});

describe('check_contracts — required field types', () => {
  test('contracts is an array', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    expect(Array.isArray(result.contracts)).toBe(true);
  });

  test('has_active_contracts is a boolean', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    expect(typeof result.has_active_contracts).toBe('boolean');
  });

  test('has_high_risk is a boolean', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    expect(typeof result.has_high_risk).toBe('boolean');
  });
});

describe('check_contracts — boolean flags reflect data', () => {
  test('has_active_contracts is true when active contracts exist', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    expect(result.has_active_contracts).toBe(true);
  });

  test('has_high_risk is true when high-risk active contract exists', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    expect(result.has_high_risk).toBe(true);
  });
});

describe('check_contracts — array items structure', () => {
  test('each active contract has required fields with correct types', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    const contracts = result.contracts as Array<Record<string, unknown>>;
    expect(contracts.length).toBeGreaterThan(0);
    for (const c of contracts) {
      expect(typeof c.contract_id).toBe('string');
      expect(typeof c.name).toBe('string');
      expect(typeof c.start_date).toBe('string');
      expect(typeof c.end_date).toBe('string');
      expect(typeof c.penalty).toBe('number');
    }
  });

  test('risk_level is one of low|medium|high', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    const contracts = result.contracts as Array<Record<string, unknown>>;
    for (const c of contracts) {
      expect(['low', 'medium', 'high']).toContain(c.risk_level);
    }
  });

  test('status is one of active|expired|terminated', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    const contracts = result.contracts as Array<Record<string, unknown>>;
    for (const c of contracts) {
      expect(['active', 'expired', 'terminated']).toContain(c.status);
    }
  });
});

describe('check_contracts — only active contracts returned', () => {
  test('expired contracts are filtered out', async () => {
    const result = await callTool(client, TOOL, { phone: PHONE });
    const contracts = result.contracts as Array<Record<string, unknown>>;
    // The service filters to active only
    for (const c of contracts) {
      expect(c.status).toBe('active');
    }
  });
});
