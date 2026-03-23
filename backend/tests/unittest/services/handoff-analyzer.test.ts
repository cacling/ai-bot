/**
 * handoff-analyzer.test.ts — analyzeHandoff 导出函数 + 类型测试
 *
 * 仅测试纯逻辑分支（空输入早返回），不调用 LLM。
 * parseOutput 的详细测试见 ../skills/handoff-analyzer.test.ts
 */

import { describe, test, expect } from 'bun:test';
import {
  analyzeHandoff,
  type TurnRecord,
  type ToolRecord,
  type HandoffAnalysis,
} from '../../../src/agent/card/handoff-analyzer';

// ── DEFAULT_ANALYSIS 结构参考（与源文件保持一致）──────────────────────────────
const EXPECTED_DEFAULT: HandoffAnalysis = {
  customer_intent:       '未能分析',
  main_issue:            '会话分析失败，请查看对话记录',
  business_object:       [],
  confirmed_information: [],
  actions_taken:         [],
  current_status:        '处理中',
  handoff_reason:        '转人工',
  next_action:           '请主动问候用户，了解具体需求',
  priority:              '中',
  risk_flags:            [],
  session_summary:       '会话分析失败，请查看原始对话记录了解详情。',
};

describe('analyzeHandoff — 纯逻辑分支', () => {
  test('空 turns 返回 DEFAULT_ANALYSIS', async () => {
    const result = await analyzeHandoff([], [], 'zh');
    expect(result).toEqual(EXPECTED_DEFAULT);
  });

  test('空 turns + 有 toolCalls 仍返回 DEFAULT_ANALYSIS', async () => {
    const toolCalls: ToolRecord[] = [
      { tool: 'query_subscriber', args: { phone: '138' }, result_summary: 'ok', success: true },
    ];
    const result = await analyzeHandoff([], toolCalls, 'zh');
    expect(result).toEqual(EXPECTED_DEFAULT);
  });

  test('空 turns + lang=en 仍返回 DEFAULT_ANALYSIS', async () => {
    const result = await analyzeHandoff([], [], 'en');
    expect(result).toEqual(EXPECTED_DEFAULT);
  });
});

describe('DEFAULT_ANALYSIS 结构完整性', () => {
  test('包含所有必需字段', async () => {
    const result = await analyzeHandoff([], [], 'zh');

    // 字符串字段
    expect(typeof result.customer_intent).toBe('string');
    expect(typeof result.main_issue).toBe('string');
    expect(typeof result.current_status).toBe('string');
    expect(typeof result.handoff_reason).toBe('string');
    expect(typeof result.next_action).toBe('string');
    expect(typeof result.priority).toBe('string');
    expect(typeof result.session_summary).toBe('string');

    // 数组字段
    expect(Array.isArray(result.business_object)).toBe(true);
    expect(Array.isArray(result.confirmed_information)).toBe(true);
    expect(Array.isArray(result.actions_taken)).toBe(true);
    expect(Array.isArray(result.risk_flags)).toBe(true);
  });

  test('字符串字段非空', async () => {
    const result = await analyzeHandoff([], [], 'zh');
    expect(result.customer_intent.length).toBeGreaterThan(0);
    expect(result.main_issue.length).toBeGreaterThan(0);
    expect(result.session_summary.length).toBeGreaterThan(0);
  });
});

describe('类型导出验证', () => {
  test('TurnRecord 类型可构造', () => {
    const turn: TurnRecord = { role: 'user', text: '你好' };
    expect(turn.role).toBe('user');
    expect(turn.text).toBe('你好');
  });

  test('TurnRecord 支持可选 ts 字段', () => {
    const turn: TurnRecord = { role: 'assistant', text: '您好', ts: Date.now() };
    expect(typeof turn.ts).toBe('number');
  });

  test('ToolRecord 类型可构造', () => {
    const record: ToolRecord = {
      tool: 'query_subscriber',
      args: { phone: '13800138000' },
      result_summary: '查询成功',
      success: true,
    };
    expect(record.tool).toBe('query_subscriber');
    expect(record.success).toBe(true);
  });

  test('HandoffAnalysis 类型具备 11 个字段', () => {
    const keys: (keyof HandoffAnalysis)[] = [
      'customer_intent', 'main_issue', 'business_object',
      'confirmed_information', 'actions_taken', 'current_status',
      'handoff_reason', 'next_action', 'priority',
      'risk_flags', 'session_summary',
    ];
    expect(keys.length).toBe(11);
  });
});
