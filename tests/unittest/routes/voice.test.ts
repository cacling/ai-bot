/**
 * voice.test.ts — voice.ts 转人工兜底逻辑单元测试
 * 运行：cd backend && bun test src/routes/voice.test.ts
 */
import { describe, test, expect } from 'bun:test';
import { TRANSFER_PHRASE_RE, VoiceSessionState } from '../../../backend/src/routes/voice';

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

// VoiceSessionState 基础功能测试已移至 voice.metrics.test.ts

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
