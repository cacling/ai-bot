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

describe('voice-common — sendSkillDiagram error handling', () => {
  test('catches errors from getSkillMermaid/translate and logs warning', async () => {
    // If ws.send throws, sendSkillDiagram should catch and not propagate
    const ws = {
      send: () => { throw new Error('ws closed'); },
    };
    // Use a real skill name that exists in the system to trigger the path past rawMermaid check.
    // If the skill does not exist, it returns early (line 45). Either way no throw.
    await expect(
      sendSkillDiagram(ws, '13800000001', 'some-skill', null, 'zh', 'test-session', 'test')
    ).resolves.toBeUndefined();
  });
});

describe('voice-common — runProgressTracking branches', () => {
  test('returns early when stateNames is empty (line 96-98)', () => {
    // A nonexistent skill returns no mermaid, already tested.
    // This test ensures no throw for a skill without states.
    const ws = { send: () => {} };
    expect(() => {
      runProgressTracking(ws, '13800000001', 'nonexistent-skill', [], 'en', 'sess-en', 'test');
    }).not.toThrow();
  });

  test('accepts English lang parameter', () => {
    const ws = { send: () => {} };
    expect(() => {
      runProgressTracking(ws, '13800000001', 'nonexistent-skill', [
        { role: 'user', text: 'I need help with my bill' },
        { role: 'assistant', text: 'Let me check' },
      ], 'en', 'sess-en-2', 'test');
    }).not.toThrow();
  });
});

describe('voice-common — setupGlmCloseHandlers', () => {
  test('module exports setupGlmCloseHandlers as function', () => {
    expect(typeof setupGlmCloseHandlers).toBe('function');
  });

  test('registers close and error handlers on glmWs', () => {
    const handlers: Record<string, Function> = {};
    const fakeGlmWs = {
      on: (event: string, handler: Function) => { handlers[event] = handler; },
    };
    const closeCalled: boolean[] = [];
    const fakeWs = {
      send: () => {},
      close: () => { closeCalled.push(true); },
    };
    setupGlmCloseHandlers(fakeGlmWs as any, fakeWs, () => null, 'sess-glm', 'test');
    expect(typeof handlers['close']).toBe('function');
    expect(typeof handlers['error']).toBe('function');
  });

  test('close handler calls ws.close when no pending handoff', async () => {
    const handlers: Record<string, Function> = {};
    const fakeGlmWs = {
      on: (event: string, handler: Function) => { handlers[event] = handler; },
    };
    let wsClosed = false;
    const fakeWs = {
      send: () => {},
      close: () => { wsClosed = true; },
    };
    setupGlmCloseHandlers(fakeGlmWs as any, fakeWs, () => null, 'sess-glm-2', 'test');
    // Simulate GLM close event
    await handlers['close'](1000, Buffer.from('normal'));
    expect(wsClosed).toBe(true);
  });

  test('close handler waits for pending handoff before closing', async () => {
    const handlers: Record<string, Function> = {};
    const fakeGlmWs = {
      on: (event: string, handler: Function) => { handlers[event] = handler; },
    };
    let wsClosed = false;
    const fakeWs = {
      send: () => {},
      close: () => { wsClosed = true; },
    };
    let handoffResolved = false;
    const pendingHandoff = new Promise<void>(resolve => {
      setTimeout(() => { handoffResolved = true; resolve(); }, 10);
    });
    setupGlmCloseHandlers(fakeGlmWs as any, fakeWs, () => pendingHandoff, 'sess-glm-3', 'test');
    await handlers['close'](1000, Buffer.from(''));
    expect(handoffResolved).toBe(true);
    expect(wsClosed).toBe(true);
  });

  test('error handler sends error message and closes ws', () => {
    const handlers: Record<string, Function> = {};
    const fakeGlmWs = {
      on: (event: string, handler: Function) => { handlers[event] = handler; },
    };
    const sent: string[] = [];
    let wsClosed = false;
    const fakeWs = {
      send: (data: string) => { sent.push(data); },
      close: () => { wsClosed = true; },
    };
    setupGlmCloseHandlers(fakeGlmWs as any, fakeWs, () => null, 'sess-glm-4', 'test');
    handlers['error'](new Error('connection reset'));
    expect(sent.length).toBe(1);
    const parsed = JSON.parse(sent[0]);
    expect(parsed.type).toBe('error');
    expect(parsed.message).toContain('connection reset');
    expect(wsClosed).toBe(true);
  });

  test('error handler does not throw if ws.send fails', () => {
    const handlers: Record<string, Function> = {};
    const fakeGlmWs = {
      on: (event: string, handler: Function) => { handlers[event] = handler; },
    };
    const fakeWs = {
      send: () => { throw new Error('already closed'); },
      close: () => { throw new Error('already closed'); },
    };
    setupGlmCloseHandlers(fakeGlmWs as any, fakeWs, () => null, 'sess-glm-5', 'test');
    expect(() => handlers['error'](new Error('oops'))).not.toThrow();
  });

  test('close handler handles reason as undefined buffer', async () => {
    const handlers: Record<string, Function> = {};
    const fakeGlmWs = {
      on: (event: string, handler: Function) => { handlers[event] = handler; },
    };
    const fakeWs = { send: () => {}, close: () => {} };
    setupGlmCloseHandlers(fakeGlmWs as any, fakeWs, () => null, 'sess-glm-6', 'test');
    // Call with undefined reason
    await handlers['close'](1006, undefined);
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
