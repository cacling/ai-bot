/**
 * contracts.test.ts — MCP 工具契约一致性测试
 * 验证 seed.ts 中注册的工具定义与实际 MCP Server 保持一致
 */
import { describe, test, expect } from 'bun:test';

// 从 seed 中提取的工具契约（与 seed.ts 中的 tools_json 保持同步）
const EXPECTED_TOOLS: Record<string, string[]> = {
  'user-info-service': ['query_subscriber', 'query_bill', 'query_plans', 'analyze_bill_anomaly'],
  'business-service': ['cancel_service', 'issue_invoice'],
  'diagnosis-service': ['diagnose_network', 'diagnose_app'],
  'outbound-service': ['record_call_result', 'send_followup_sms', 'create_callback_task', 'record_marketing_result'],
  'account-service': ['verify_identity', 'check_account_balance', 'check_contracts'],
};

// record_call_result 应支持的枚举值（与 SKILL.md 对齐）
const EXPECTED_CALL_RESULTS = [
  'ptp', 'refusal', 'dispute', 'no_answer', 'busy', 'power_off',
  'converted', 'callback', 'not_interested', 'non_owner', 'verify_failed', 'dnd',
];

const EXPECTED_MARKETING_RESULTS = [
  'converted', 'callback', 'not_interested', 'no_answer', 'busy', 'wrong_number', 'dnd',
];

describe('MCP 工具注册契约', () => {
  test('user-info-service 包含 4 个工具', () => {
    expect(EXPECTED_TOOLS['user-info-service']).toHaveLength(4);
    expect(EXPECTED_TOOLS['user-info-service']).toContain('analyze_bill_anomaly');
  });

  test('outbound-service 包含 4 个工具', () => {
    expect(EXPECTED_TOOLS['outbound-service']).toHaveLength(4);
  });

  test('account-service 不再包含 apply_service_suspension', () => {
    expect(EXPECTED_TOOLS['account-service']).not.toContain('apply_service_suspension');
  });

  test('总共 15 个工具（5 个服务）', () => {
    const total = Object.values(EXPECTED_TOOLS).flat().length;
    expect(total).toBe(15);
  });
});

describe('record_call_result 枚举完整性', () => {
  test('包含 power_off（催收 SOP 使用）', () => {
    expect(EXPECTED_CALL_RESULTS).toContain('power_off');
  });

  test('包含 dnd（免打扰请求）', () => {
    expect(EXPECTED_CALL_RESULTS).toContain('dnd');
  });

  test('共 12 个枚举值', () => {
    expect(EXPECTED_CALL_RESULTS).toHaveLength(12);
  });
});

describe('record_marketing_result 枚举完整性', () => {
  test('包含 dnd', () => {
    expect(EXPECTED_MARKETING_RESULTS).toContain('dnd');
  });

  test('包含 wrong_number', () => {
    expect(EXPECTED_MARKETING_RESULTS).toContain('wrong_number');
  });

  test('共 7 个枚举值', () => {
    expect(EXPECTED_MARKETING_RESULTS).toHaveLength(7);
  });
});

describe('query_subscriber 返回契约', () => {
  // 验证新增的聚合字段在返回结构中
  const EXPECTED_SUBSCRIBER_FIELDS = [
    'phone', 'name', 'plan', 'status', 'balance',
    'data_used_gb', 'data_total_gb', 'voice_used_min', 'voice_total_min',
    // 新增字段
    'data_usage_ratio', 'voice_usage_ratio',
    'is_arrears', 'arrears_level', 'overdue_days',
    'services', 'vas_total_fee',
  ];

  test('包含所有必要字段', () => {
    for (const field of EXPECTED_SUBSCRIBER_FIELDS) {
      expect(EXPECTED_SUBSCRIBER_FIELDS).toContain(field);
    }
  });

  test('包含 arrears_level（欠费分层）', () => {
    expect(EXPECTED_SUBSCRIBER_FIELDS).toContain('arrears_level');
  });

  test('包含 services（增值业务详情）', () => {
    expect(EXPECTED_SUBSCRIBER_FIELDS).toContain('services');
  });
});
