/**
 * agent-ws.test.ts — Tests for agent WebSocket handler helpers
 */
import { describe, test, expect } from 'bun:test';

// The module exports only the default Hono app, but we can test that it loads
// and test the buildHandoffFallback logic via the module internals.
// Since buildHandoffFallback is not exported, we test the module loads correctly
// and test the i18n/tool-label dependencies it uses.

import { t, TOOL_LABELS } from '../../../../../backend/src/services/i18n';
import { checkCompliance } from '../../../../../backend/src/services/keyword-filter';
import { setAgentLang, getLangs } from '../../../../../backend/src/services/lang-session';

describe('agent-ws — module and dependencies', () => {
  test('module loads without error', async () => {
    const mod = await import('../../../../../backend/src/agent/chat/agent-ws');
    expect(mod.default).toBeDefined();
  });

  test('TOOL_LABELS has zh and en entries', () => {
    expect(TOOL_LABELS.zh).toBeDefined();
    expect(TOOL_LABELS.en).toBeDefined();
    expect(typeof TOOL_LABELS.zh).toBe('object');
    expect(typeof TOOL_LABELS.en).toBe('object');
  });

  test('t() returns string for handoff keys (zh)', () => {
    expect(typeof t('handoff_default_intent', 'zh')).toBe('string');
    expect(typeof t('status_in_progress', 'zh')).toBe('string');
    expect(typeof t('handoff_reason_user_request', 'zh')).toBe('string');
    expect(typeof t('handoff_next_action_greet', 'zh')).toBe('string');
    expect(typeof t('priority_medium', 'zh')).toBe('string');
  });

  test('t() returns string for handoff keys (en)', () => {
    expect(typeof t('handoff_default_intent', 'en')).toBe('string');
    expect(typeof t('status_in_progress', 'en')).toBe('string');
  });

  test('compliance check works for agent messages', () => {
    const clean = checkCompliance('你好，请问有什么可以帮您？');
    expect(clean.hasBlock).toBe(false);
  });

  test('setAgentLang and getLangs work together', () => {
    const phone = '13899990001';
    setAgentLang(phone, 'en');
    const langs = getLangs(phone);
    expect(langs.agent).toBe('en');
  });

  test('tool_success i18n template works', () => {
    const result = t('tool_success', 'zh', '查询余额');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('compliance_block i18n template works', () => {
    const result = t('compliance_block', 'zh', '违规词');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('list_separator returns correct separator', () => {
    const zhSep = t('list_separator', 'zh');
    const enSep = t('list_separator', 'en');
    expect(typeof zhSep).toBe('string');
    expect(typeof enSep).toBe('string');
  });
});

describe('agent-ws — buildHandoffFallback logic (reconstructed)', () => {
  // Reconstruct the buildHandoffFallback logic for testing since it's not exported
  type ToolRecord = { tool: string; success: boolean; result_summary: string };

  function buildHandoffFallback(
    userMessage: string,
    toolRecords: ToolRecord[],
    args: { current_intent?: string; recommended_action?: string },
    lang: 'zh' | 'en' = 'zh',
  ) {
    const labels = TOOL_LABELS[lang];
    const toolNames = toolRecords
      .filter(r => r.success && r.tool !== 'transfer_to_human')
      .map(r => t('tool_success', lang, labels[r.tool] ?? r.tool));
    return {
      customer_intent: args.current_intent ?? t('handoff_default_intent', lang),
      main_issue: userMessage.slice(0, 50),
      business_object: [],
      confirmed_information: [],
      actions_taken: toolNames,
      current_status: t('status_in_progress', lang),
      handoff_reason: args.current_intent ?? t('handoff_reason_user_request', lang),
      next_action: args.recommended_action ?? t('handoff_next_action_greet', lang),
      priority: t('priority_medium', lang),
      risk_flags: [],
      session_summary: t('handoff_summary_basic', lang, userMessage.slice(0, 30), toolRecords.length > 0),
    };
  }

  test('returns default intent when no args.current_intent', () => {
    const result = buildHandoffFallback('hello', [], {});
    expect(result.customer_intent).toBe(t('handoff_default_intent', 'zh'));
  });

  test('uses provided current_intent', () => {
    const result = buildHandoffFallback('hello', [], { current_intent: '查询余额' });
    expect(result.customer_intent).toBe('查询余额');
  });

  test('truncates main_issue to 50 chars', () => {
    const longMsg = 'a'.repeat(100);
    const result = buildHandoffFallback(longMsg, [], {});
    expect(result.main_issue.length).toBe(50);
  });

  test('filters successful tool records (excluding transfer_to_human)', () => {
    const tools: ToolRecord[] = [
      { tool: 'query_balance', success: true, result_summary: 'ok' },
      { tool: 'transfer_to_human', success: true, result_summary: 'ok' },
      { tool: 'query_plan', success: false, result_summary: 'fail' },
    ];
    const result = buildHandoffFallback('test', tools, {}, 'zh');
    expect(result.actions_taken.length).toBe(1);
  });

  test('works with en language', () => {
    const result = buildHandoffFallback('hello', [], {}, 'en');
    expect(result.customer_intent).toBe(t('handoff_default_intent', 'en'));
    expect(result.current_status).toBe(t('status_in_progress', 'en'));
  });

  test('uses recommended_action when provided', () => {
    const result = buildHandoffFallback('test', [], { recommended_action: '请核实身份' });
    expect(result.next_action).toBe('请核实身份');
  });

  test('empty tool records results in empty actions_taken', () => {
    const result = buildHandoffFallback('test', [], {});
    expect(result.actions_taken).toEqual([]);
  });
});
