/**
 * Tool Contract: query_plans
 * Server: user-info-service (:18003)
 * Input:  { plan_id?: string }
 * Output: packages/shared-db/src/schemas/query_plans.json
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  mockBackend({
    get: (path: string) => {
      if (path.includes('/plans/plan_a')) {
        return {
          success: true,
          plan: {
            plan_id: 'plan_a',
            name: '畅享套餐A',
            monthly_fee: 99,
            data_gb: 20,
            voice_min: 500,
            sms: 100,
            features: ['5G', '视频彩铃'],
            description: '适合中度使用用户的全能套餐',
          },
        };
      }
      if (path.endsWith('/plans')) {
        return {
          success: true,
          plans: [
            {
              plan_id: 'plan_a',
              name: '畅享套餐A',
              monthly_fee: 99,
              data_gb: 20,
              voice_min: 500,
              sms: 100,
              features: ['5G', '视频彩铃'],
              description: '适合中度使用用户的全能套餐',
            },
            {
              plan_id: 'plan_b',
              name: '经济套餐B',
              monthly_fee: 49,
              data_gb: 5,
              voice_min: 200,
              sms: 50,
              features: ['4G'],
              description: '适合轻度使用用户的经济套餐',
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

describe('query_plans contract', () => {
  test('output conforms to schema (all plans)', async () => {
    const res = await callTool(client, 'query_plans', {});
    const errors = validateSchema('query_plans', res);
    expect(errors).toEqual([]);
  });

  test('required fields are present', async () => {
    const res = await callTool(client, 'query_plans', {});
    expect(typeof res.count).toBe('number');
    expect(Array.isArray(res.plans)).toBe(true);
    expect(res.count).toBe(2);
  });

  test('plan item has all required fields', async () => {
    const res = await callTool(client, 'query_plans', { plan_id: 'plan_a' });
    const plans = res.plans as Array<Record<string, unknown>>;
    expect(plans.length).toBe(1);
    const plan = plans[0];
    expect(typeof plan.plan_id).toBe('string');
    expect(typeof plan.name).toBe('string');
    expect(typeof plan.monthly_fee).toBe('number');
    expect(typeof plan.data_gb).toBe('number');
    expect(typeof plan.voice_min).toBe('number');
    expect(typeof plan.sms).toBe('number');
    expect(Array.isArray(plan.features)).toBe(true);
    expect(typeof plan.description).toBe('string');
  });

  test('features array contains strings', async () => {
    const res = await callTool(client, 'query_plans', { plan_id: 'plan_a' });
    const plans = res.plans as Array<Record<string, unknown>>;
    const features = plans[0].features as unknown[];
    for (const f of features) {
      expect(typeof f).toBe('string');
    }
  });

  test('single plan query conforms to schema', async () => {
    const res = await callTool(client, 'query_plans', { plan_id: 'plan_a' });
    const errors = validateSchema('query_plans', res);
    expect(errors).toEqual([]);
    expect(res.count).toBe(1);
  });

  test('not-found plan returns empty plans array', async () => {
    const res = await callTool(client, 'query_plans', { plan_id: 'nonexistent' });
    const errors = validateSchema('query_plans', res);
    expect(errors).toEqual([]);
    expect(res.count).toBe(0);
    expect((res.plans as unknown[]).length).toBe(0);
  });
});
