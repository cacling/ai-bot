/**
 * Tool Contract: record_call_result
 * Server: outbound-service (:18006)
 * Input:  { result: enum[ptp|refusal|...12 values], remark?: string, ptp_date?: string, callback_time?: string }
 * Output: packages/shared-db/src/schemas/record_call_result.json
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import { type Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  mockBackend({
    post: (path) => {
      if (path === '/api/outreach/calls/result') {
        return {
          success: true,
          result_id: 'CR-20260326-001',
          next_action: '等待客户回款',
        };
      }
      return { success: false };
    },
  });

  const createServer = await loadService('src/services/outbound_service.ts');
  client = await createTestClient(createServer);
});

describe('record_call_result — schema validation', () => {
  test('response passes JSON Schema validation', async () => {
    const result = await callTool(client, 'record_call_result', {
      result: 'ptp',
      ptp_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      remark: '客户承诺3天内还款',
    });
    const errors = validateSchema('record_call_result', result);
    expect(errors).toEqual([]);
  });
});

describe('record_call_result — required output fields', () => {
  test('response has required: result_category(enum: positive|negative|neutral)', async () => {
    const result = await callTool(client, 'record_call_result', {
      result: 'ptp',
      ptp_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    });
    expect(typeof result.result_category).toBe('string');
    const validCategories = ['positive', 'negative', 'neutral'];
    expect(validCategories).toContain(result.result_category);
  });
});

describe('record_call_result — category mapping', () => {
  test('ptp maps to positive', async () => {
    const result = await callTool(client, 'record_call_result', {
      result: 'ptp',
      ptp_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    });
    expect(result.result_category).toBe('positive');
  });

  test('refusal maps to negative', async () => {
    const result = await callTool(client, 'record_call_result', {
      result: 'refusal',
    });
    expect(result.result_category).toBe('negative');
  });

  test('no_answer maps to neutral', async () => {
    const result = await callTool(client, 'record_call_result', {
      result: 'no_answer',
    });
    expect(result.result_category).toBe('neutral');
  });

  test('dnd maps to negative', async () => {
    const result = await callTool(client, 'record_call_result', {
      result: 'dnd',
    });
    expect(result.result_category).toBe('negative');
  });
});

describe('record_call_result — enum fields', () => {
  test('result is echoed back as valid enum value', async () => {
    const validResults = ['ptp', 'refusal', 'dispute', 'no_answer', 'busy', 'power_off', 'converted', 'callback', 'not_interested', 'non_owner', 'verify_failed', 'dnd'];
    const result = await callTool(client, 'record_call_result', {
      result: 'callback',
      callback_time: '2026-03-28T10:00:00',
    });
    expect(validResults).toContain(result.result);
  });
});
