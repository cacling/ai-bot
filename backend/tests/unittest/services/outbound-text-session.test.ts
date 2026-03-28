/**
 * outbound-text-session.test.ts — Tests for text-mode outbound session
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { OutboundTextSession, type OutboundTextConfig } from '../../../src/services/outbound-text-session';

// ── Mocks ────────────────────────────────────────────────────────────────────

let generateTextCalls: any[] = [];
let callMcpToolCalls: any[] = [];

mock.module('ai', () => ({
  generateText: async (opts: any) => {
    generateTextCalls.push(opts);
    // Simulate a simple response
    return {
      text: 'Hello, this is a test response.',
      steps: [],
      response: { messages: [{ role: 'assistant', content: 'Hello, this is a test response.' }] },
    };
  },
  jsonSchema: (schema: any) => schema,
}));

mock.module('../../../src/engine/llm', () => ({
  chatModel: 'mock-model',
}));

mock.module('../../../src/services/mcp-client', () => ({
  callMcpTool: async (sessionId: string, toolName: string, args: any) => {
    callMcpToolCalls.push({ sessionId, toolName, args });
    return { success: true, text: JSON.stringify({ ok: true }) };
  },
}));

mock.module('../../../src/services/tool-call-middleware', () => ({
  preprocessToolCall: () => {},
  postprocessToolResult: async () => ({ spokenText: 'Tool result processed', skillName: 'outbound-collection' }),
}));

mock.module('../../../src/services/translate-lang', () => ({
  translateText: async (text: string) => `[translated]${text}`,
}));

mock.module('../../../src/services/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

mock.module('../../../src/services/session-bus', () => ({
  sessionBus: { publish: () => {}, clearHistory: () => {}, subscribe: () => () => {} },
}));

mock.module('../../../src/services/voice-common', () => ({
  sendSkillDiagram: async () => {},
  runProgressTracking: () => {},
  triggerHandoff: () => null,
}));

mock.module('../../../src/services/voice-session', () => ({
  VoiceSessionState: class {
    turns: any[] = [];
    toolCalls: any[] = [];
    addUserTurn(t: string) { this.turns.push({ role: 'user', text: t, ts: Date.now() }); }
    addAssistantTurn(t: string) { this.turns.push({ role: 'assistant', text: t, ts: Date.now() }); }
    recordTool(name: string, args: any, result: string, success: boolean) { this.toolCalls.push({ tool: name, args, result_summary: result.slice(0, 150), success }); }
  },
}));

mock.module('../../../src/services/i18n', () => ({
  t: (...args: any[]) => args.join('_'),
  OUTBOUND_TOOL_LABELS: { zh: {}, en: {} },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSendSpy() {
  const calls: string[] = [];
  return {
    send: (data: string) => calls.push(data),
    calls,
    parsed: () => calls.map(c => JSON.parse(c)),
  };
}

function makeConfig(overrides?: Partial<OutboundTextConfig>): OutboundTextConfig {
  return {
    sessionId: 'test-session',
    userPhone: '13800000001',
    lang: 'zh',
    systemPrompt: 'You are an outbound agent.',
    glmTools: [
      { type: 'function', name: 'record_call_result', description: '记录通话结果', parameters: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'] } },
      { type: 'function', name: 'transfer_to_human', description: '转人工', parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] } },
    ],
    taskParam: 'collection',
    taskId: 'C001',
    resolvedTask: { customer_name: '张三' },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OutboundTextSession', () => {
  beforeEach(() => {
    generateTextCalls = [];
    callMcpToolCalls = [];
  });

  test('start() sends bot opening response via WS', async () => {
    const ws = makeSendSpy();
    const session = new OutboundTextSession(makeConfig());

    await session.start(ws);

    const msgs = ws.parsed();
    // Should have at least one response message
    const responses = msgs.filter(m => m.source === 'bot' && m.type === 'response');
    expect(responses.length).toBeGreaterThanOrEqual(1);
    expect(responses[0].text).toBeTruthy();
    expect(responses[0].msg_id).toBeTruthy();

    // generateText should have been called
    expect(generateTextCalls.length).toBe(1);
    // System prompt includes disposition instructions appended by constructor
    expect(generateTextCalls[0].system).toContain('You are an outbound agent.');
    expect(generateTextCalls[0].system).toContain('Disposition');
  });

  test('handleMessage() sends bot response to user message', async () => {
    const ws = makeSendSpy();
    const session = new OutboundTextSession(makeConfig());

    await session.start(ws);
    ws.calls.length = 0; // clear start messages

    await session.handleMessage(JSON.stringify({ type: 'chat_message', message: '我知道了' }), ws);

    const msgs = ws.parsed();
    const responses = msgs.filter(m => m.source === 'bot' && m.type === 'response');
    expect(responses.length).toBe(1);
    expect(responses[0].text).toBeTruthy();

    // generateText should have been called again with history
    expect(generateTextCalls.length).toBe(2); // 1 from start + 1 from handleMessage
  });

  test('handleMessage() ignores non-chat_message types', async () => {
    const ws = makeSendSpy();
    const session = new OutboundTextSession(makeConfig());

    await session.start(ws);
    ws.calls.length = 0;

    await session.handleMessage(JSON.stringify({ type: 'ping' }), ws);

    expect(ws.calls.length).toBe(0);
  });

  test('handleMessage() sends error for invalid JSON', async () => {
    const ws = makeSendSpy();
    const session = new OutboundTextSession(makeConfig());

    await session.start(ws);
    ws.calls.length = 0;

    await session.handleMessage('not json', ws);

    const msgs = ws.parsed();
    expect(msgs[0].type).toBe('error');
  });

  test('buildTools converts GLM tools to Vercel AI SDK format', async () => {
    const session = new OutboundTextSession(makeConfig());

    await session.start(makeSendSpy());

    // Check that generateText was called with tools
    const call = generateTextCalls[0];
    expect(call.tools).toBeDefined();
    // record_call_result is now handled via disposition, not as a direct tool
    expect(call.tools.record_call_result).toBeUndefined();
    // transfer_to_human is still a direct tool
    expect(call.tools.transfer_to_human).toBeDefined();
    expect(call.tools.transfer_to_human.description).toBe('转人工');
  });
});
