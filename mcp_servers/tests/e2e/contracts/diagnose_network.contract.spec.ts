/**
 * Tool Contract: diagnose_network
 * Server: diagnosis-service (:18005)
 * Input:  { phone: string, issue_type: enum[no_signal|slow_data|call_drop|no_network], lang?: enum[zh|en] }
 * Output: packages/shared-db/src/schemas/diagnose_network.json
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import { type Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  mockBackend({
    post: (path) => {
      if (path === '/api/diagnosis/network/analyze') {
        return {
          success: true,
          msisdn: '13800001111',
          issue_type: 'slow_data',
          severity: 'warning',
          escalate: false,
          diagnostic_steps: [
            { step: '信号强度检测', status: 'ok', detail: '信号强度 -75dBm，正常范围' },
            { step: 'DNS 解析检测', status: 'warning', detail: 'DNS 响应延迟 320ms，高于正常值' },
            { step: '基站负载检测', status: 'error', detail: '当前基站负载 92%，超出阈值' },
          ],
          conclusion: '网络拥塞导致数据传输缓慢',
        };
      }
      return { success: false };
    },
  });

  const createServer = await loadService('src/services/diagnosis_service.ts');
  client = await createTestClient(createServer);
});

describe('diagnose_network — schema validation', () => {
  test('response passes JSON Schema validation', async () => {
    const result = await callTool(client, 'diagnose_network', {
      phone: '13800001111',
      issue_type: 'slow_data',
    });
    const errors = validateSchema('diagnose_network', result);
    expect(errors).toEqual([]);
  });
});

describe('diagnose_network — required output fields', () => {
  test('response has required: diagnostic_steps(array), should_escalate(bool)', async () => {
    const result = await callTool(client, 'diagnose_network', {
      phone: '13800001111',
      issue_type: 'slow_data',
    });
    expect(Array.isArray(result.diagnostic_steps)).toBe(true);
    expect(typeof result.should_escalate).toBe('boolean');
  });
});

describe('diagnose_network — diagnostic_steps items', () => {
  test('each step has step(string), status(enum: ok|warning|error), detail(string)', async () => {
    const result = await callTool(client, 'diagnose_network', {
      phone: '13800001111',
      issue_type: 'slow_data',
    });
    const steps = result.diagnostic_steps as Array<Record<string, unknown>>;
    expect(steps.length).toBe(3);

    const validStatuses = ['ok', 'warning', 'error'];
    for (const s of steps) {
      expect(typeof s.step).toBe('string');
      expect(typeof s.status).toBe('string');
      expect(validStatuses).toContain(s.status);
      expect(typeof s.detail).toBe('string');
    }
  });
});

describe('diagnose_network — enum fields', () => {
  test('severity is enum: normal|warning|critical', async () => {
    const result = await callTool(client, 'diagnose_network', {
      phone: '13800001111',
      issue_type: 'slow_data',
    });
    const validSeverity = ['normal', 'warning', 'critical'];
    expect(validSeverity).toContain(result.severity);
  });
});
