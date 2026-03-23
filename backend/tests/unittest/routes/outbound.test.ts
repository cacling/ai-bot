/**
 * outbound.test.ts — 外呼机器人工具处理与配置测试
 *
 * 不依赖 GLM-Realtime，仅测试工具结果处理、任务数据、语速配置等逻辑。
 */

import { describe, test, expect } from 'bun:test';

// ── Mock 数据（从 outbound.ts 复制核心结构）──────────────────────────────────

interface CollectionCase {
  case_id: string; customer_name: string; overdue_amount: number;
  overdue_days: number; due_date: string; product_name: string; strategy: string;
}

interface MarketingTask {
  campaign_id: string; campaign_name: string; customer_name: string;
  current_plan: string; target_plan_name: string; target_plan_fee: number;
}

const MOCK_COLLECTION: Record<string, CollectionCase> = {
  C001: { case_id: 'C001', customer_name: '张明', overdue_amount: 386, overdue_days: 30, due_date: '2026-03-15', product_name: '宽带包年套餐', strategy: '轻催' },
  C002: { case_id: 'C002', customer_name: '李华', overdue_amount: 1280, overdue_days: 45, due_date: '2026-03-10', product_name: '家庭融合套餐', strategy: '中催' },
};

const MOCK_MARKETING: Record<string, MarketingTask> = {
  M001: { campaign_id: 'M001', campaign_name: '5G升级专项活动', customer_name: '陈伟', current_plan: '4G畅享套餐', target_plan_name: '5G畅享套餐', target_plan_fee: 199 },
};

// ── 语速配置 ──────────────────────────────────────────────────────────────

const VOICE_CONFIG: Record<string, { voice: string; styleLabel: string }> = {
  collection: { voice: 'tongtong', styleLabel: '沉稳认真型' },
  marketing: { voice: 'tongtong', styleLabel: '热情活泼型' },
};

// ── 工具结果处理逻辑 ──────────────────────────────────────────────────────────

function processToolResult(toolName: string, toolArgs: Record<string, unknown>, userPhone: string): string {
  if (toolName === 'record_call_result') {
    const result = toolArgs.result as string;
    const remark = toolArgs.remark ? `，备注：${toolArgs.remark}` : '';
    const extra = toolArgs.ptp_date ? `，承诺还款日：${toolArgs.ptp_date}` : (toolArgs.callback_time ? `，回访时间：${toolArgs.callback_time}` : '');
    return JSON.stringify({ success: true, message: `通话结果已记录：${result}${extra}${remark}` });
  } else if (toolName === 'send_followup_sms') {
    const smsType = toolArgs.sms_type as string;
    const smsLabel: Record<string, string> = { payment_link: '还款链接', plan_detail: '套餐详情', callback_reminder: '回访提醒', product_detail: '产品详情' };
    return JSON.stringify({ success: true, message: `${smsLabel[smsType] ?? smsType}短信已发送至 ${userPhone}` });
  } else if (toolName === 'create_callback_task') {
    const cbTime = (toolArgs.preferred_time ?? '') as string;
    const cbPhone = (toolArgs.callback_phone ?? userPhone) as string;
    return JSON.stringify({ success: true, message: `回访任务已创建，将于 ${cbTime} 联系 ${cbPhone}` });
  }
  return JSON.stringify({ error: `未知工具：${toolName}` });
}

describe('外呼 Mock 数据完整性', () => {
  test('催收案件数据完整', () => {
    expect(Object.keys(MOCK_COLLECTION).length).toBeGreaterThanOrEqual(2);
    const c = MOCK_COLLECTION.C001;
    expect(c.customer_name).toBe('张明');
    expect(c.overdue_amount).toBeGreaterThan(0);
    expect(c.strategy).toBeTruthy();
  });

  test('营销任务数据完整', () => {
    const m = MOCK_MARKETING.M001;
    expect(m.customer_name).toBe('陈伟');
    expect(m.target_plan_fee).toBeGreaterThan(0);
  });

});

describe('外呼语速配置', () => {
  test('两种任务类型都有配置', () => {
    expect(VOICE_CONFIG.collection).toBeTruthy();
    expect(VOICE_CONFIG.marketing).toBeTruthy();
  });

  test('催收使用沉稳语速', () => {
    expect(VOICE_CONFIG.collection.styleLabel).toContain('沉稳');
  });

  test('营销使用热情语速', () => {
    expect(VOICE_CONFIG.marketing.styleLabel).toContain('热情');
  });
});

describe('外呼工具 — record_call_result', () => {
  test('PTP 结果记录', () => {
    const r = JSON.parse(processToolResult('record_call_result', { result: 'ptp', ptp_date: '2026-03-18' }, '138'));
    expect(r.success).toBe(true);
    expect(r.message).toContain('ptp');
    expect(r.message).toContain('2026-03-18');
  });

  test('回访结果记录', () => {
    const r = JSON.parse(processToolResult('record_call_result', { result: 'callback', callback_time: '下周一上午10点' }, '138'));
    expect(r.success).toBe(true);
    expect(r.message).toContain('callback');
    expect(r.message).toContain('下周一');
  });

  test('拒绝结果记录（带备注）', () => {
    const r = JSON.parse(processToolResult('record_call_result', { result: 'refusal', remark: '客户说不需要' }, '138'));
    expect(r.message).toContain('refusal');
    expect(r.message).toContain('客户说不需要');
  });
});

describe('外呼工具 — send_followup_sms', () => {
  test('发送还款链接短信', () => {
    const r = JSON.parse(processToolResult('send_followup_sms', { sms_type: 'payment_link' }, '13800000001'));
    expect(r.success).toBe(true);
    expect(r.message).toContain('还款链接');
    expect(r.message).toContain('13800000001');
  });

  test('发送套餐详情短信', () => {
    const r = JSON.parse(processToolResult('send_followup_sms', { sms_type: 'plan_detail' }, '138'));
    expect(r.message).toContain('套餐详情');
  });
});

describe('外呼工具 — create_callback_task', () => {
  test('创建回访任务（默认号码）', () => {
    const r = JSON.parse(processToolResult('create_callback_task', { preferred_time: '明天上午10点' }, '13800000001'));
    expect(r.success).toBe(true);
    expect(r.message).toContain('明天上午10点');
    expect(r.message).toContain('13800000001');
  });

  test('创建回访任务（指定号码）', () => {
    const r = JSON.parse(processToolResult('create_callback_task', { preferred_time: '周三下午', callback_phone: '13900000002' }, '13800000001'));
    expect(r.message).toContain('13900000002');
  });
});

describe('外呼工具 — 未知工具', () => {
  test('未知工具返回错误', () => {
    const r = JSON.parse(processToolResult('unknown_tool', {}, '138'));
    expect(r.error).toContain('未知工具');
  });
});
