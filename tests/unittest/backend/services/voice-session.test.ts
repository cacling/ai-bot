/**
 * voice-session.test.ts — 语音会话状态跟踪测试
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { VoiceSessionState, TRANSFER_PHRASE_RE } from '../../../../backend/src/services/voice-session';

describe('VoiceSessionState — 对话轮次管理', () => {
  let state: VoiceSessionState;

  beforeEach(() => {
    state = new VoiceSessionState('13800000001', 'test-session-001');
  });

  test('初始状态', () => {
    expect(state.phone).toBe('13800000001');
    expect(state.sessionId).toBe('test-session-001');
    expect(state.turns).toHaveLength(0);
    expect(state.toolCalls).toHaveLength(0);
    expect(state.consecutiveToolFails).toBe(0);
    expect(state.currentBotAccum).toBe('');
    expect(state.transferTriggered).toBe(false);
    expect(state.farewellDone).toBe(false);
    expect(state.bargeInCount).toBe(0);
    expect(state.silenceCount).toBe(0);
  });

  test('addUserTurn 记录用户话语', () => {
    state.addUserTurn('你好');
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0].role).toBe('user');
    expect(state.turns[0].text).toBe('你好');
    expect(state.turns[0].ts).toBeGreaterThan(0);
  });

  test('addAssistantTurn 记录助手话语并清空 currentBotAccum', () => {
    state.currentBotAccum = '正在累积的文本';
    state.addAssistantTurn('您好，请问有什么可以帮您？');
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0].role).toBe('assistant');
    expect(state.turns[0].text).toBe('您好，请问有什么可以帮您？');
    expect(state.currentBotAccum).toBe('');
  });

  test('多轮对话记录', () => {
    state.addUserTurn('查话费');
    state.addAssistantTurn('好的，正在查询');
    state.addUserTurn('谢谢');
    expect(state.turns).toHaveLength(3);
    expect(state.turns[0].role).toBe('user');
    expect(state.turns[1].role).toBe('assistant');
    expect(state.turns[2].role).toBe('user');
  });
});

describe('VoiceSessionState — 工具调用记录', () => {
  let state: VoiceSessionState;

  beforeEach(() => {
    state = new VoiceSessionState('13800000001', 'test-session-002');
  });

  test('recordTool 记录成功的工具调用', () => {
    state.recordTool('query_bill', { phone: '13800000001' }, '{"bill":{"total":100}}', true);
    expect(state.toolCalls).toHaveLength(1);
    expect(state.toolCalls[0].tool).toBe('query_bill');
    expect(state.toolCalls[0].success).toBe(true);
    expect(state.consecutiveToolFails).toBe(0);
  });

  test('recordTool 记录失败的工具调用', () => {
    state.recordTool('query_bill', { phone: '13800000001' }, '{"error":"timeout"}', false);
    expect(state.consecutiveToolFails).toBe(1);
  });

  test('连续失败计数在成功后重置', () => {
    state.recordTool('query_bill', {}, 'error', false);
    state.recordTool('query_bill', {}, 'error', false);
    expect(state.consecutiveToolFails).toBe(2);
    state.recordTool('query_bill', {}, '{"ok":true}', true);
    expect(state.consecutiveToolFails).toBe(0);
  });

  test('从参数中提取槽位', () => {
    state.recordTool('query_subscriber', { phone: '13800000001' }, '{}', true);
    expect(state.collectedSlots.phone).toBe('13800000001');

    state.recordTool('cancel_service', { service_id: 'video_pkg', phone: '13800000001' }, '{}', true);
    expect(state.collectedSlots.service_id).toBe('video_pkg');

    state.recordTool('diagnose_network', { phone: '13800000001', issue_type: 'slow_data' }, '{}', true);
    expect(state.collectedSlots.issue_type).toBe('slow_data');
  });

  test('结果截断为 300 字符', () => {
    const longResult = 'x'.repeat(500);
    state.recordTool('test', {}, longResult, true);
    expect(state.toolCalls[0].result_summary).toHaveLength(300);
  });
});

describe('VoiceSessionState — 可观测指标', () => {
  let state: VoiceSessionState;

  beforeEach(() => {
    state = new VoiceSessionState('13800000001', 'test-session-003');
  });

  test('markBargeIn 递增打断计数', () => {
    expect(state.bargeInCount).toBe(0);
    state.markBargeIn();
    expect(state.bargeInCount).toBe(1);
    state.markBargeIn();
    expect(state.bargeInCount).toBe(2);
  });

  test('markUserEnd + markFirstAudioPack 记录首包时延', () => {
    state.markUserEnd();
    // 模拟短暂延迟
    const latency = state.markFirstAudioPack();
    expect(latency).not.toBeNull();
    expect(latency!).toBeGreaterThanOrEqual(0);
    expect(state.firstPackLatencies).toHaveLength(1);
  });

  test('markFirstAudioPack 在未调用 markUserEnd 时返回 null', () => {
    const latency = state.markFirstAudioPack();
    expect(latency).toBeNull();
  });

  test('markFirstAudioPack 只记录首包（第二次调用返回 null）', () => {
    state.markUserEnd();
    const first = state.markFirstAudioPack();
    expect(first).not.toBeNull();
    const second = state.markFirstAudioPack();
    expect(second).toBeNull();
  });

  test('getMetrics 返回汇总指标', () => {
    state.addUserTurn('你好');
    state.addAssistantTurn('您好');
    state.recordTool('query_bill', {}, '{}', true);
    state.recordTool('diagnose_network', {}, '{}', false);
    state.markBargeIn();

    const metrics = state.getMetrics();
    expect(metrics.total_turns).toBe(2);
    expect(metrics.total_tool_calls).toBe(2);
    expect(metrics.tool_success_count).toBe(1);
    expect(metrics.transfer_triggered).toBe(false);
    expect(metrics.barge_in_count).toBe(1);
    expect(metrics.session_duration_ms).toBeGreaterThanOrEqual(0);
  });

  test('getMetrics 无首包时延时返回 null', () => {
    const metrics = state.getMetrics();
    expect(metrics.first_pack_latency_avg_ms).toBeNull();
    expect(metrics.first_pack_latency_p95_ms).toBeNull();
  });

  test('getMetrics 有首包时延时计算平均值', () => {
    state.markUserEnd();
    state.markFirstAudioPack();
    state.markUserEnd();
    state.markFirstAudioPack();

    const metrics = state.getMetrics();
    expect(metrics.first_pack_latency_avg_ms).not.toBeNull();
    expect(typeof metrics.first_pack_latency_avg_ms).toBe('number');
  });
});

describe('TRANSFER_PHRASE_RE — 转人工话术检测', () => {
  test('是 RegExp 实例', () => {
    expect(TRANSFER_PHRASE_RE).toBeInstanceOf(RegExp);
  });

  test('检测中文转人工短语', () => {
    expect(TRANSFER_PHRASE_RE.test('我现在为您转接人工客服')).toBe(true);
    expect(TRANSFER_PHRASE_RE.test('正在为您转接')).toBe(true);
  });

  test('不匹配普通文本', () => {
    expect(TRANSFER_PHRASE_RE.test('您好，请问有什么可以帮您？')).toBe(false);
    expect(TRANSFER_PHRASE_RE.test('您的账单金额是100元')).toBe(false);
  });
});
