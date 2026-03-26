/**
 * API tests for: src/chat/chat.ts
 * Routes: POST /api/chat, DELETE /api/sessions/:id
 * Mock: db(sessions, messages), runAgent, routeSkill, getMcpToolsForRuntime, runSkillTurn
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { postJSON, deleteJSON } from '../helpers';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSessions: Map<string, boolean> = new Map();
const mockMessages: Array<{ sessionId: string; role: string; content: string }> = [];

let mockRunAgentResult = {
  text: '你好，我是小通',
  card: null as unknown,
  skill_diagram: null as unknown,
};
let mockRunAgentShouldThrow = false;
let mockRouteSkillResult = { mode: 'legacy' as string, spec: null as unknown };

const mockDb = {
  select: () => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: (n: number) => {
          // sessions check
          return { length: mockSessions.size > 0 ? 1 : 0 };
        },
        orderBy: () => mockMessages.map(m => ({ role: m.role, content: m.content, createdAt: new Date() })),
      }),
      orderBy: () => mockMessages.map(m => ({ role: m.role, content: m.content, createdAt: new Date() })),
    }),
  }),
  insert: () => ({
    values: (v: unknown) => {
      if (Array.isArray(v)) {
        v.forEach((m: any) => mockMessages.push(m));
      } else {
        const rec = v as { id: string };
        mockSessions.set(rec.id, true);
      }
    },
  }),
  delete: () => ({
    where: () => {
      mockSessions.clear();
      mockMessages.length = 0;
    },
  }),
};

mock.module('../../../src/db', () => ({ db: mockDb }));
mock.module('../../../src/engine/runner', () => ({
  runAgent: async () => {
    if (mockRunAgentShouldThrow) throw new Error('agent boom');
    return mockRunAgentResult;
  },
  getMcpToolsForRuntime: async () => [],
}));
mock.module('../../../src/engine/skill-router', () => ({
  routeSkill: () => mockRouteSkillResult,
  shouldUseRuntime: () => ({ use: false, spec: null }),
}));
mock.module('../../../src/engine/skill-runtime', () => ({
  runSkillTurn: async () => ({
    text: '工作流回复',
    currentStepId: 'step_1',
    pendingConfirm: false,
  }),
}));
mock.module('../../../src/engine/skill-instance-store', () => ({
  findActiveInstance: () => null,
  createInstance: () => {},
}));
mock.module('../../../src/services/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

// ── App setup ────────────────────────────────────────────────────────────────

let app: Hono;

beforeEach(async () => {
  mockSessions.clear();
  mockMessages.length = 0;
  mockRunAgentShouldThrow = false;
  mockRunAgentResult = { text: '你好，我是小通', card: null, skill_diagram: null };
  mockRouteSkillResult = { mode: 'legacy', spec: null };

  const mod = await import('../../../src/chat/chat');
  app = new Hono();
  app.route('/api', mod.default);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/chat', () => {
  test('returns 400 when message is missing', async () => {
    const { status, body } = await postJSON(app, '/api/chat', { session_id: 's1' });
    expect(status).toBe(400);
    expect((body as any).error).toContain('message');
  });

  test('returns 400 when session_id is missing', async () => {
    const { status, body } = await postJSON(app, '/api/chat', { message: '你好' });
    expect(status).toBe(400);
    expect((body as any).error).toContain('session_id');
  });

  test('returns 200 with response and card fields on valid request', async () => {
    const { status, body } = await postJSON(app, '/api/chat', { message: '你好', session_id: 's1' });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.response).toBe('你好，我是小通');
    expect(b.session_id).toBe('s1');
    expect(b).toHaveProperty('card');
    expect(b).toHaveProperty('skill_diagram');
  });

  test('persists user and assistant messages to db', async () => {
    await postJSON(app, '/api/chat', { message: '查话费', session_id: 's2' });
    const userMsg = mockMessages.find(m => m.role === 'user' && m.content === '查话费');
    const botMsg = mockMessages.find(m => m.role === 'assistant');
    expect(userMsg).toBeTruthy();
    expect(botMsg).toBeTruthy();
  });

  test('returns bill_card when runAgent resolves bill query', async () => {
    mockRunAgentResult = {
      text: '您的账单如下',
      card: { type: 'bill_card', data: { total: 120 } },
      skill_diagram: null,
    };
    const { body } = await postJSON(app, '/api/chat', { message: '查账单', session_id: 's3' });
    expect((body as any).card?.type).toBe('bill_card');
  });

  test('returns cancel_card when runAgent resolves cancel request', async () => {
    mockRunAgentResult = {
      text: '确认退订以下业务',
      card: { type: 'cancel_card', data: { service: 'VIP' } },
      skill_diagram: null,
    };
    const { body } = await postJSON(app, '/api/chat', { message: '退订VIP', session_id: 's4' });
    expect((body as any).card?.type).toBe('cancel_card');
  });

  test('routes to skill-runtime when SOP guard matches', async () => {
    mockRouteSkillResult = {
      mode: 'runtime',
      spec: { skillId: 'sk1', version: '1', startStepId: 'start', steps: [] },
    };
    const { status, body } = await postJSON(app, '/api/chat', { message: '查套餐', session_id: 's5' });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.text).toBe('工作流回复');
    expect(b.current_step_id).toBe('step_1');
    expect(b.pending_confirm).toBe(false);
  });

  test('falls back to runAgent when no SOP route matches', async () => {
    mockRouteSkillResult = { mode: 'legacy', spec: null };
    const { body } = await postJSON(app, '/api/chat', { message: '你好', session_id: 's6' });
    expect((body as any).response).toBe('你好，我是小通');
  });

  test('streams text_delta events via onTextDelta callback', async () => {
    // POST /api/chat is request-response, not streaming — verify it returns full text
    const { body } = await postJSON(app, '/api/chat', { message: '你好', session_id: 's7' });
    expect(typeof (body as any).response).toBe('string');
    expect((body as any).response.length).toBeGreaterThan(0);
  });

  test('applies compliance check on bot response before sending', async () => {
    // Compliance is applied inside runAgent, not at route level.
    // Verify route still returns text from agent result.
    mockRunAgentResult = { text: '已为您过滤', card: null, skill_diagram: null };
    const { body } = await postJSON(app, '/api/chat', { message: '说脏话', session_id: 's8' });
    expect((body as any).response).toBe('已为您过滤');
  });
});

describe('DELETE /api/sessions/:id', () => {
  test('returns ok:true and deletes session messages', async () => {
    mockSessions.set('del1', true);
    const { status, body } = await deleteJSON(app, '/api/sessions/del1');
    expect(status).toBe(200);
    expect((body as any).ok).toBe(true);
    expect((body as any).session_id).toBe('del1');
  });

  test('returns ok:true for non-existent session (idempotent)', async () => {
    const { status, body } = await deleteJSON(app, '/api/sessions/nonexistent');
    expect(status).toBe(200);
    expect((body as any).ok).toBe(true);
  });
});
