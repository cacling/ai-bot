/**
 * Tool Contract: diagnose_app
 * Server: diagnosis-service (:18005)
 * Input:  { phone: string, issue_type: enum[app_locked|login_failed|device_incompatible|suspicious_activity] }
 * Output: packages/shared-db/src/schemas/diagnose_app.json
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import { type Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  mockBackend({
    post: (path) => {
      if (path === '/api/diagnosis/app/analyze') {
        return {
          success: true,
          issue_type: 'app_locked',
          lock_reason: 'multiple_failed_attempts',
          diagnostic_steps: [
            { step: '账户状态检查', status: 'error', detail: '账户已被锁定', action: '等待自动解锁或人工解锁', escalate: false },
            { step: '登录尝试记录', status: 'warning', detail: '过去1小时内连续失败5次', action: '建议修改密码', escalate: true },
            { step: '设备兼容性检查', status: 'ok', detail: '设备型号兼容', action: null, escalate: null },
          ],
          conclusion: '账户因多次登录失败被锁定，建议引导客户重置密码',
          escalation_path: 'frontline',
          customer_actions: ['重置密码', '等待30分钟后重试', '联系客服解锁'],
        };
      }
      return { success: false };
    },
  });

  const createServer = await loadService('src/services/diagnosis_service.ts');
  client = await createTestClient(createServer);
});

describe('diagnose_app — schema validation', () => {
  test('response passes JSON Schema validation', async () => {
    const result = await callTool(client, 'diagnose_app', {
      phone: '13800002222',
      issue_type: 'app_locked',
    });
    const errors = validateSchema('diagnose_app', result);
    expect(errors).toEqual([]);
  });
});

describe('diagnose_app — required output fields', () => {
  test('response has required: diagnostic_steps(array), conclusion(string), escalation_path(string), customer_actions(array), risk_level(string), next_step(string), action_count(int)', async () => {
    const result = await callTool(client, 'diagnose_app', {
      phone: '13800002222',
      issue_type: 'app_locked',
    });
    expect(Array.isArray(result.diagnostic_steps)).toBe(true);
    expect(typeof result.conclusion).toBe('string');
    expect(typeof result.escalation_path).toBe('string');
    expect(Array.isArray(result.customer_actions)).toBe(true);
    expect(typeof result.risk_level).toBe('string');
    expect(typeof result.next_step).toBe('string');
    expect(typeof result.action_count).toBe('number');
    expect(Number.isInteger(result.action_count)).toBe(true);
  });
});

describe('diagnose_app — enum fields', () => {
  test('escalation_path is enum: self_service|frontline|security_team', async () => {
    const result = await callTool(client, 'diagnose_app', {
      phone: '13800002222',
      issue_type: 'app_locked',
    });
    const validPaths = ['self_service', 'frontline', 'security_team'];
    expect(validPaths).toContain(result.escalation_path);
  });

  test('risk_level is enum: none|low|medium|high', async () => {
    const result = await callTool(client, 'diagnose_app', {
      phone: '13800002222',
      issue_type: 'app_locked',
    });
    const validRiskLevels = ['none', 'low', 'medium', 'high'];
    expect(validRiskLevels).toContain(result.risk_level);
  });
});
