/**
 * voice.test.ts — voice.ts 转人工兜底逻辑单元测试
 * 运行：cd backend && bun test src/routes/voice.test.ts
 */
import { describe, test, expect } from 'bun:test';
import { TRANSFER_PHRASE_RE, VoiceSessionState } from './voice';

// ── TRANSFER_PHRASE_RE ─────────────────────────────────────────────────────────

describe('TRANSFER_PHRASE_RE', () => {
  test('检测"为您转接"', () => {
    expect(TRANSFER_PHRASE_RE.test('好的，我这就为您转接人工客服，请稍候。')).toBe(true);
  });

  test('检测"转人工客服"', () => {
    expect(TRANSFER_PHRASE_RE.test('好的，正在帮您转人工客服。')).toBe(true);
  });

  test('检测"转接人工"', () => {
    expect(TRANSFER_PHRASE_RE.test('您好，我来为您转接人工处理。')).toBe(true);
  });

  test('检测"正在为您转接"', () => {
    expect(TRANSFER_PHRASE_RE.test('正在为您转接，请稍等。')).toBe(true);
  });

  test('普通回复不触发', () => {
    expect(TRANSFER_PHRASE_RE.test('您好，我是小通，请问有什么可以帮您？')).toBe(false);
  });

  test('账单回复不触发', () => {
    expect(TRANSFER_PHRASE_RE.test('您本月消费 58 元，流量还剩 3.2 GB。')).toBe(false);
  });
});

// ── VoiceSessionState ─────────────────────────────────────────────────────────

describe('VoiceSessionState', () => {
  test('初始 transferTriggered = false', () => {
    const s = new VoiceSessionState('13800000001', 'session-1');
    expect(s.transferTriggered).toBe(false);
  });

  test('手动置位后 transferTriggered = true', () => {
    const s = new VoiceSessionState('13800000001', 'session-2');
    s.transferTriggered = true;
    expect(s.transferTriggered).toBe(true);
  });

  test('addUserTurn / addAssistantTurn 正确追加对话', () => {
    const s = new VoiceSessionState('13800000001', 'session-3');
    s.addUserTurn('帮我查话费');
    s.addAssistantTurn('您本月费用 58 元。');
    expect(s.turns.length).toBe(2);
    expect(s.turns[0].role).toBe('user');
    expect(s.turns[1].role).toBe('assistant');
  });

  test('recordTool 记录成功调用并重置连续失败计数', () => {
    const s = new VoiceSessionState('13800000001', 'session-4');
    s.consecutiveToolFails = 2;
    s.recordTool('query_bill', { phone: '13800000001' }, '{"total":58}', true);
    expect(s.toolCalls.length).toBe(1);
    expect(s.consecutiveToolFails).toBe(0);
    expect(s.collectedSlots.phone).toBe('13800000001');
  });

  test('recordTool 失败时累加 consecutiveToolFails', () => {
    const s = new VoiceSessionState('13800000001', 'session-5');
    s.recordTool('query_bill', {}, '错误', false);
    s.recordTool('query_bill', {}, '错误', false);
    expect(s.consecutiveToolFails).toBe(2);
  });
});

// ── 防止重复触发：模拟 triggerHandoff 幂等性 ──────────────────────────────────

describe('转人工防重复触发', () => {
  test('transferTriggered 已为 true 时跳过', () => {
    const s = new VoiceSessionState('13800000001', 'session-6');
    const sent: string[] = [];
    const fakeWs = { send: (d: string) => sent.push(d) };

    // 模拟 triggerHandoff 逻辑（检查 flag 并发送）
    function simulateTrigger() {
      if (s.transferTriggered) return;
      s.transferTriggered = true;
      fakeWs.send(JSON.stringify({ type: 'transfer_to_human' }));
    }

    simulateTrigger(); // 第一次：应发送
    simulateTrigger(); // 第二次：已触发，跳过
    expect(sent.length).toBe(1);
  });

  test('语音检测触发后 transferTriggered 置为 true', () => {
    const s = new VoiceSessionState('13800000001', 'session-7');
    s.addAssistantTurn('好的，我这就为您转接人工客服，请稍候。');

    // 模拟 response.audio_transcript.done 检测
    const transcript = s.turns[s.turns.length - 1].text;
    if (!s.transferTriggered && TRANSFER_PHRASE_RE.test(transcript)) {
      s.transferTriggered = true;
    }

    expect(s.transferTriggered).toBe(true);
  });
});
