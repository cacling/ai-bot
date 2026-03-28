/**
 * Tool Contract: create_callback_task
 * Server: outbound-service (:18006)
 * Input:  { original_task_id: string, callback_phone: string, preferred_time: string, customer_name?: string, product_name?: string }
 * Output: packages/shared-db/src/schemas/create_callback_task.json
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import { type Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  mockBackend({
    post: (path) => {
      if (path === '/api/callback/create') {
        return {
          success: true,
          callback_task_id: 'CB-20260326-001',
        };
      }
      return { success: false };
    },
  });

  const createServer = await loadService('src/services/outbound_service.ts');
  client = await createTestClient(createServer);
});

describe('create_callback_task — schema validation', () => {
  test('response passes JSON Schema validation', async () => {
    const result = await callTool(client, 'create_callback_task', {
      original_task_id: 'TASK-001',
      callback_phone: '13800004444',
      preferred_time: '2026-03-28T14:00:00',
      customer_name: '张三',
      product_name: '畅享套餐',
    });
    const errors = validateSchema('create_callback_task', result);
    expect(errors).toEqual([]);
  });
});

describe('create_callback_task — required output fields', () => {
  test('response has required: callback_task_id(string)', async () => {
    const result = await callTool(client, 'create_callback_task', {
      original_task_id: 'TASK-001',
      callback_phone: '13800004444',
      preferred_time: '2026-03-28T14:00:00',
    });
    expect(typeof result.callback_task_id).toBe('string');
    expect((result.callback_task_id as string).length).toBeGreaterThan(0);
  });
});

describe('create_callback_task — optional fields nullable', () => {
  test('customer_name is string or null', async () => {
    const result = await callTool(client, 'create_callback_task', {
      original_task_id: 'TASK-002',
      callback_phone: '13800005555',
      preferred_time: '2026-03-29T10:00:00',
    });
    expect(result.customer_name === null || typeof result.customer_name === 'string').toBe(true);
  });

  test('product_name is string or null', async () => {
    const result = await callTool(client, 'create_callback_task', {
      original_task_id: 'TASK-002',
      callback_phone: '13800005555',
      preferred_time: '2026-03-29T10:00:00',
    });
    expect(result.product_name === null || typeof result.product_name === 'string').toBe(true);
  });

  test('status is string or null', async () => {
    const result = await callTool(client, 'create_callback_task', {
      original_task_id: 'TASK-002',
      callback_phone: '13800005555',
      preferred_time: '2026-03-29T10:00:00',
    });
    expect(result.status === null || typeof result.status === 'string').toBe(true);
  });

  test('optional fields present when provided', async () => {
    const result = await callTool(client, 'create_callback_task', {
      original_task_id: 'TASK-003',
      callback_phone: '13800006666',
      preferred_time: '2026-03-30T09:00:00',
      customer_name: '李四',
      product_name: '5G套餐',
    });
    expect(result.original_task_id).toBe('TASK-003');
    expect(result.callback_phone).toBe('13800006666');
    expect(result.preferred_time).toBe('2026-03-30T09:00:00');
    expect(result.customer_name).toBe('李四');
    expect(result.product_name).toBe('5G套餐');
  });
});
