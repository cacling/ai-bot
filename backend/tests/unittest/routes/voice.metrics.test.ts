/**
 * voice.metrics.test.ts — VoiceSessionState 可观测指标测试
 */

import { describe, test, expect } from 'bun:test';
import { VoiceSessionState } from '../../../src/chat/voice.ts';

describe('VoiceSessionState — 基础功能', () => {
  test('初始化状态', () => {
    const state = new VoiceSessionState('13800000001', 'test-session');
    expect(state.phone).toBe('13800000001');
    expect(state.sessionId).toBe('test-session');
    expect(state.turns).toHaveLength(0);
    expect(state.toolCalls).toHaveLength(0);
    expect(state.transferTriggered).toBe(false);
  });

  test('添加对话轮次', () => {
    const state = new VoiceSessionState('13800000001', 'test');
    state.addUserTurn('你好');
    state.addAssistantTurn('您好，有什么可以帮您？');
    expect(state.turns).toHaveLength(2);
    expect(state.turns[0].role).toBe('user');
    expect(state.turns[1].role).toBe('assistant');
  });

  test('记录工具调用并提取槽位', () => {
    const state = new VoiceSessionState('13800000001', 'test');
    state.recordTool('query_bill', { phone: '13800000001', month: '2026-03' }, '{"total": 350}', true);
    expect(state.toolCalls).toHaveLength(1);
    expect(state.collectedSlots.phone).toBe('13800000001');
    expect(state.consecutiveToolFails).toBe(0);
  });

  test('连续失败计数', () => {
    const state = new VoiceSessionState('13800000001', 'test');
    state.recordTool('query_bill', {}, 'error', false);
    state.recordTool('query_bill', {}, 'error', false);
    expect(state.consecutiveToolFails).toBe(2);

    state.recordTool('query_bill', {}, '{"ok":true}', true);
    expect(state.consecutiveToolFails).toBe(0);
  });
});

describe('VoiceSessionState — 可观测指标', () => {
  test('首包时延计算', () => {
    const state = new VoiceSessionState('13800000001', 'test');

    // 模拟用户说完
    state.markUserEnd();
    expect(state.lastUserEndTs).toBeGreaterThan(0);

    // 模拟延迟后收到首包
    const latency = state.markFirstAudioPack();
    expect(latency).not.toBeNull();
    expect(latency!).toBeGreaterThanOrEqual(0);
    expect(state.firstPackLatencies).toHaveLength(1);
  });

  test('非等待状态调用 markFirstAudioPack 返回 null', () => {
    const state = new VoiceSessionState('13800000001', 'test');
    // 未调用 markUserEnd 就调用 markFirstAudioPack
    expect(state.markFirstAudioPack()).toBeNull();
  });

  test('重复调用 markFirstAudioPack 只记录一次', () => {
    const state = new VoiceSessionState('13800000001', 'test');
    state.markUserEnd();
    state.markFirstAudioPack();
    const second = state.markFirstAudioPack();
    expect(second).toBeNull(); // 第二次返回 null
    expect(state.firstPackLatencies).toHaveLength(1);
  });

  test('打断计数', () => {
    const state = new VoiceSessionState('13800000001', 'test');
    state.markBargeIn();
    state.markBargeIn();
    state.markBargeIn();
    expect(state.bargeInCount).toBe(3);
  });

  test('冷场检测（5 秒超时）', async () => {
    const state = new VoiceSessionState('13800000001', 'test');
    // 修改冷场检测内部的 setTimeout 来测试
    // 直接测试：markUserEnd 后不调用 markFirstAudioPack，silenceCount 应在超时后增加
    state.markUserEnd();

    // 等待冷场超时（实际是 5 秒，但我们测试 state 结构正确性）
    expect(state.silenceTimer).not.toBeNull();

    // 如果在超时前调用 markFirstAudioPack，冷场计时器应被取消
    state.markFirstAudioPack();
    expect(state.silenceTimer).toBeNull();
  });

  test('getMetrics 输出完整指标', () => {
    const state = new VoiceSessionState('13800000001', 'test');
    state.addUserTurn('你好');
    state.addAssistantTurn('您好');
    state.recordTool('query_bill', {}, '{"ok":true}', true);
    state.recordTool('diagnose_network', {}, 'error', false);
    state.markBargeIn();
    state.markUserEnd();
    state.markFirstAudioPack();

    const metrics = state.getMetrics();
    expect(metrics.total_turns).toBe(2);
    expect(metrics.total_tool_calls).toBe(2);
    expect(metrics.tool_success_count).toBe(1);
    expect(metrics.transfer_triggered).toBe(false);
    expect(metrics.barge_in_count).toBe(1);
    expect(metrics.silence_count).toBe(0);
    expect(metrics.first_pack_latency_avg_ms).not.toBeNull();
    expect(metrics.session_duration_ms).toBeGreaterThanOrEqual(0);
  });

  test('无首包数据时 latency 为 null', () => {
    const state = new VoiceSessionState('13800000001', 'test');
    const metrics = state.getMetrics();
    expect(metrics.first_pack_latency_avg_ms).toBeNull();
    expect(metrics.first_pack_latency_p95_ms).toBeNull();
  });
});
