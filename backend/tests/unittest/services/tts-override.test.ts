/**
 * tts-override.test.ts — Tests for TtsOverride sentence-splitting + translate + TTS pipeline
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { TtsOverride, type TtsOverrideOpts } from '../../../src/services/tts-override';

// ── mock translateText & textToSpeech ────────────────────────────────────────

mock.module('../../../src/services/translate-lang', () => ({
  translateText: async (text: string, _lang: string) => `[en]${text}`,
}));

mock.module('../../../src/services/tts', () => ({
  textToSpeech: async (_text: string, _lang: string) => 'base64audio',
}));

mock.module('../../../src/services/logger', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSendSpy() {
  const calls: string[] = [];
  return {
    send: (data: string) => calls.push(data),
    calls,
  };
}

function makeOpts(ws: { send(data: string): void }, lang: 'zh' | 'en' = 'en'): TtsOverrideOpts {
  return { lang, sessionId: 'test-session', channel: 'test', ws };
}

function parseMessages(calls: string[]) {
  return calls.map((c) => JSON.parse(c));
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('TtsOverride', () => {
  test('active = false when lang is zh', () => {
    const ws = makeSendSpy();
    const tts = new TtsOverride(makeOpts(ws, 'zh'));
    expect(tts.active).toBe(false);
  });

  test('active = true when lang is en', () => {
    const ws = makeSendSpy();
    const tts = new TtsOverride(makeOpts(ws, 'en'));
    expect(tts.active).toBe(true);
  });

  test('onDelta splits on 。 and sends translated sentence', async () => {
    const ws = makeSendSpy();
    const tts = new TtsOverride(makeOpts(ws));

    tts.onDelta('你好');
    tts.onDelta('世界。');

    // Wait for async queue to complete
    await new Promise((r) => setTimeout(r, 100));

    const msgs = parseMessages(ws.calls);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe('tts_override');
    expect(msgs[0].text).toBe('[en]你好世界。');
    expect(msgs[0].audio).toBe('base64audio');
  });

  test('onDelta splits across multiple deltas (streaming scenario)', async () => {
    const ws = makeSendSpy();
    const tts = new TtsOverride(makeOpts(ws));

    // Simulate character-by-character streaming (like GLM realtime)
    for (const ch of '第一句。第二句？') {
      tts.onDelta(ch);
    }

    await new Promise((r) => setTimeout(r, 200));

    const msgs = parseMessages(ws.calls);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].text).toBe('[en]第一句。');
    expect(msgs[1].text).toBe('[en]第二句？');
  });

  test('flushRemainder sends remaining text without sentence ender', async () => {
    const ws = makeSendSpy();
    const tts = new TtsOverride(makeOpts(ws));

    tts.onDelta('未完待续');
    tts.flushRemainder();

    await new Promise((r) => setTimeout(r, 100));

    const msgs = parseMessages(ws.calls);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBe('[en]未完待续');
  });

  test('flushRemainder does nothing when no pending text', async () => {
    const ws = makeSendSpy();
    const tts = new TtsOverride(makeOpts(ws));

    tts.onDelta('完整句。');
    tts.flushRemainder();

    await new Promise((r) => setTimeout(r, 100));

    const msgs = parseMessages(ws.calls);
    expect(msgs).toHaveLength(1); // only the sentence, no extra flush
    expect(msgs[0].text).toBe('[en]完整句。');
  });

  test('flushRemainder resets state for next turn', async () => {
    const ws = makeSendSpy();
    const tts = new TtsOverride(makeOpts(ws));

    tts.onDelta('第一轮。');
    tts.flushRemainder();

    await new Promise((r) => setTimeout(r, 100));

    // Simulate new turn
    tts.onDelta('第二轮。');
    tts.flushRemainder();

    await new Promise((r) => setTimeout(r, 100));

    const msgs = parseMessages(ws.calls);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].text).toBe('[en]第一轮。');
    expect(msgs[1].text).toBe('[en]第二轮。');
  });

  test('onDelta ignores empty delta', async () => {
    const ws = makeSendSpy();
    const tts = new TtsOverride(makeOpts(ws));

    tts.onDelta('');
    tts.onDelta('');
    tts.flushRemainder();

    await new Promise((r) => setTimeout(r, 50));

    expect(ws.calls).toHaveLength(0);
  });

  test('splits on ；and \\n as well', async () => {
    const ws = makeSendSpy();
    const tts = new TtsOverride(makeOpts(ws));

    tts.onDelta('分号句；换行句\n');

    await new Promise((r) => setTimeout(r, 200));

    const msgs = parseMessages(ws.calls);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].text).toBe('[en]分号句；');
    expect(msgs[1].text).toBe('[en]换行句');
  });
});
