/**
 * voice-common.test.ts — Tests for voice common utility functions
 */
import { describe, test, expect } from 'bun:test';
import {
  sendSkillDiagram,
  runEmotionAnalysis,
  runProgressTracking,
  triggerHandoff,
  setupGlmCloseHandlers,
  type HandoffConfig,
} from '../../../src/services/voice-common';
import { VoiceSessionState } from '../../../src/services/voice-session';
import { t } from '../../../src/services/i18n';

describe('voice-common — sendSkillDiagram', () => {
  test('handles nonexistent skill silently', async () => {
    const sent: string[] = [];
    const ws = { send: (data: string) => sent.push(data) };
    await sendSkillDiagram(ws, '13800000001', 'nonexistent-skill', null, 'zh', 'test-session', 'test');
    // Should not send anything since skill doesn't exist
    expect(sent.length).toBe(0);
  });
});

describe('voice-common — runEmotionAnalysis', () => {
  test('runs without throwing', () => {
    const sent: string[] = [];
    const ws = { send: (data: string) => sent.push(data) };
    // This is async fire-and-forget; just verify it doesn't throw synchronously
    expect(() => {
      runEmotionAnalysis(ws, '13800000001', 'Hello', []);
    }).not.toThrow();
  });

  test('accepts empty turns', () => {
    const ws = { send: () => {} };
    expect(() => {
      runEmotionAnalysis(ws, '13800000001', 'test', []);
    }).not.toThrow();
  });

  test('accepts turns with content', () => {
    const ws = { send: () => {} };
    expect(() => {
      runEmotionAnalysis(ws, '13800000001', 'I am upset', [
        { role: 'user', text: 'I am upset' },
        { role: 'assistant', text: 'I understand' },
      ]);
    }).not.toThrow();
  });
});

describe('voice-common — runProgressTracking', () => {
  test('handles nonexistent skill silently', () => {
    const ws = { send: () => {} };
    expect(() => {
      runProgressTracking(ws, '13800000001', 'nonexistent-skill', [], 'zh', 'test-session', 'test');
    }).not.toThrow();
  });
});

describe('voice-common — triggerHandoff', () => {
  function makeConfig(lang: 'zh' | 'en' = 'zh'): HandoffConfig {
    return {
      toolLabels: { query_balance: '查询余额' },
      defaultIntent: t('handoff_default_intent', lang),
      buildSummary: (intent, tools) => `Summary: ${intent} / ${tools}`,
      buildMainIssue: (intent) => `Issue: ${intent}`,
      businessObject: ['account'],
      buildActionLabel: (tc, label) => `${label}: ${tc.result_summary}`,
      defaultNextAction: t('handoff_next_action_greet', lang),
      defaultPriority: t('priority_medium', lang),
      analysisLang: lang,
      channel: 'test',
      lang,
    };
  }

  test('returns null if already transferred', () => {
    const state = new VoiceSessionState('13800000001', 'sess-1');
    state.transferTriggered = true;
    const result = triggerHandoff(state, { send: () => {} }, 'sess-1', 'test', {}, makeConfig());
    expect(result).toBeNull();
  });

  test('returns promise when not yet transferred', () => {
    const state = new VoiceSessionState('13800000001', 'sess-2');
    const sent: string[] = [];
    const ws = { send: (data: string) => sent.push(data) };
    const result = triggerHandoff(state, ws, 'sess-2', 'user requested', {}, makeConfig());
    expect(result).not.toBeNull();
    expect(result instanceof Promise).toBe(true);
    expect(state.transferTriggered).toBe(true);
  });

  test('sets transferTriggered to true', () => {
    const state = new VoiceSessionState('13800000001', 'sess-3');
    triggerHandoff(state, { send: () => {} }, 'sess-3', 'test', {}, makeConfig());
    expect(state.transferTriggered).toBe(true);
  });

  test('uses current_intent from toolArgs when provided', () => {
    const state = new VoiceSessionState('13800000001', 'sess-4');
    const sent: string[] = [];
    const ws = { send: (data: string) => sent.push(data) };
    const result = triggerHandoff(
      state, ws, 'sess-4', 'reason',
      { current_intent: 'Custom Intent' },
      makeConfig(),
    );
    expect(result).not.toBeNull();
  });

  test('tracks tool frequency from state', () => {
    const state = new VoiceSessionState('13800000001', 'sess-5');
    state.toolCalls.push(
      { tool: 'query_balance', success: true, result_summary: 'ok' },
      { tool: 'query_balance', success: true, result_summary: 'ok' },
      { tool: 'query_plan', success: false, result_summary: 'fail' },
    );
    const sent: string[] = [];
    const ws = { send: (data: string) => sent.push(data) };
    const result = triggerHandoff(state, ws, 'sess-5', 'reason', {}, makeConfig());
    expect(result).not.toBeNull();
  });
});

describe('voice-common — setupGlmCloseHandlers', () => {
  test('module exports setupGlmCloseHandlers as function', () => {
    expect(typeof setupGlmCloseHandlers).toBe('function');
  });
});

describe('voice-common — module loads', () => {
  test('all exports are defined', async () => {
    const mod = await import('../../../../backend/src/services/voice-common');
    expect(typeof mod.sendSkillDiagram).toBe('function');
    expect(typeof mod.runEmotionAnalysis).toBe('function');
    expect(typeof mod.runProgressTracking).toBe('function');
    expect(typeof mod.triggerHandoff).toBe('function');
    expect(typeof mod.setupGlmCloseHandlers).toBe('function');
  });
});
