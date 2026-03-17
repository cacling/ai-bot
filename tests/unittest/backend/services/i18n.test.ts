/**
 * i18n.test.ts — 国际化字符串管理测试
 */

import { describe, test, expect } from 'bun:test';
import { t, TOOL_LABELS, OUTBOUND_TOOL_LABELS, SMS_LABELS, type Lang } from '../../../../backend/src/services/i18n';

describe('t() — 静态字符串', () => {
  test('返回中文静态字符串', () => {
    expect(t('list_separator', 'zh')).toBe('、');
    expect(t('status_in_progress', 'zh')).toBe('处理中');
    expect(t('priority_high', 'zh')).toBe('高');
  });

  test('返回英文静态字符串', () => {
    expect(t('list_separator', 'en')).toBe(', ');
    expect(t('status_in_progress', 'en')).toBe('In Progress');
    expect(t('priority_high', 'en')).toBe('high');
  });

  test('不存在的 key 返回 key 本身', () => {
    expect(t('nonexistent_key', 'zh')).toBe('nonexistent_key');
    expect(t('nonexistent_key', 'en')).toBe('nonexistent_key');
  });

  test('greeting 相关字符串', () => {
    expect(t('greeting_generic', 'zh')).toContain('客服小通');
    expect(t('greeting_generic', 'en')).toContain('Xiaotong');
  });

  test('transfer_default 字符串', () => {
    expect(t('transfer_default', 'zh')).toContain('转接');
    expect(t('transfer_default', 'en')).toContain('transfer');
  });
});

describe('t() — 模板函数', () => {
  test('tool_success 中文', () => {
    const result = t('tool_success', 'zh', '查询账单');
    expect(result).toBe('查询账单（成功）');
  });

  test('tool_success 英文', () => {
    const result = t('tool_success', 'en', 'Bill query');
    expect(result).toBe('Bill query (success)');
  });

  test('tool_failed 中英文', () => {
    expect(t('tool_failed', 'zh', '查询')).toBe('查询（失败）');
    expect(t('tool_failed', 'en', 'Query')).toBe('Query (failed)');
  });

  test('tool_no_data 中英文', () => {
    expect(t('tool_no_data', 'zh', '查询')).toBe('查询（无数据）');
    expect(t('tool_no_data', 'en', 'Query')).toBe('Query (no data)');
  });

  test('tool_unknown 中英文', () => {
    expect(t('tool_unknown', 'zh', 'foo_tool')).toBe('未知工具：foo_tool');
    expect(t('tool_unknown', 'en', 'foo_tool')).toBe('Unknown tool: foo_tool');
  });

  test('greeting_with_subscriber 带参数', () => {
    const zh = t('greeting_with_subscriber', 'zh', '张三', '畅享套餐');
    expect(zh).toContain('张三');
    expect(zh).toContain('畅享套餐');

    const en = t('greeting_with_subscriber', 'en', 'John', 'Premium');
    expect(en).toContain('John');
    expect(en).toContain('Premium');
  });

  test('compliance_block 带参数', () => {
    const zh = t('compliance_block', 'zh', '违规词');
    expect(zh).toContain('违规词');
    expect(zh).toContain('拦截');

    const en = t('compliance_block', 'en', 'bad_word');
    expect(en).toContain('bad_word');
    expect(en).toContain('blocked');
  });

  test('handoff_summary_basic 带参数', () => {
    const zh = t('handoff_summary_basic', 'zh', '查账单', true);
    expect(zh).toContain('查账单');
    expect(zh).toContain('已执行');

    const zhNoTools = t('handoff_summary_basic', 'zh', '查账单', false);
    expect(zhNoTools).not.toContain('已执行');
  });

  test('outbound_sms_sent 带参数', () => {
    const zh = t('outbound_sms_sent', 'zh', '还款链接', '13800000001');
    expect(zh).toContain('还款链接');
    expect(zh).toContain('13800000001');
  });
});

describe('TOOL_LABELS — 工具名映射', () => {
  test('中文工具标签覆盖所有基本工具', () => {
    const tools = ['query_subscriber', 'query_bill', 'query_plans', 'cancel_service', 'diagnose_network', 'diagnose_app'];
    for (const tool of tools) {
      expect(TOOL_LABELS.zh[tool]).toBeTruthy();
      expect(TOOL_LABELS.en[tool]).toBeTruthy();
    }
  });

  test('中英文标签不同', () => {
    expect(TOOL_LABELS.zh.query_subscriber).not.toBe(TOOL_LABELS.en.query_subscriber);
  });
});

describe('OUTBOUND_TOOL_LABELS', () => {
  test('外呼工具标签覆盖所有工具', () => {
    const tools = ['record_call_result', 'send_followup_sms', 'transfer_to_human', 'create_callback_task'];
    for (const tool of tools) {
      expect(OUTBOUND_TOOL_LABELS.zh[tool]).toBeTruthy();
      expect(OUTBOUND_TOOL_LABELS.en[tool]).toBeTruthy();
    }
  });
});

describe('SMS_LABELS', () => {
  test('短信标签覆盖所有类型', () => {
    const types = ['payment_link', 'plan_detail', 'callback_reminder', 'product_detail'];
    for (const type of types) {
      expect(SMS_LABELS.zh[type]).toBeTruthy();
      expect(SMS_LABELS.en[type]).toBeTruthy();
    }
  });
});
