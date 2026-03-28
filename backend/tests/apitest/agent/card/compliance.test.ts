/**
 * API tests for: src/agent/card/compliance.ts
 * Routes: GET/POST/DELETE /api/compliance/keywords, POST /api/compliance/keywords/reload, POST /api/compliance/check
 * Mock: keyword-filter functions, requireRole (dev mode auto-pass)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { postJSON, getJSON, deleteJSON } from '../../helpers';

// ── Mock keyword-filter ──────────────────────────────────────────────────────

let mockKeywords: Array<{ id: string; keyword: string; category: string; description?: string }> = [];
let nextId = 1;

mock.module('../../../../src/services/keyword-filter', () => ({
  getAllKeywords: () => mockKeywords,
  addKeyword: (keyword: string, category: string, description?: string) => {
    const entry = { id: `custom_${nextId++}`, keyword, category, description };
    mockKeywords.push(entry);
    return entry;
  },
  removeKeyword: (id: string) => {
    const idx = mockKeywords.findIndex(k => k.id === id);
    if (idx === -1) return false;
    mockKeywords.splice(idx, 1);
    return true;
  },
  reloadKeywords: () => {},
  checkCompliance: (text: string) => {
    const matches: Array<{ keyword: string; category: string; position: number }> = [];
    const piiMatches: Array<{ type: string; value: string; masked: string; position: number }> = [];

    for (const kw of mockKeywords) {
      const pos = text.indexOf(kw.keyword);
      if (pos !== -1) matches.push({ keyword: kw.keyword, category: kw.category, position: pos });
    }

    // Simple PII detection for tests
    const idCardMatch = text.match(/\d{17}[\dX]/);
    if (idCardMatch) {
      piiMatches.push({ type: 'id_card', value: idCardMatch[0], masked: idCardMatch[0].slice(0, 4) + '******' + idCardMatch[0].slice(-4), position: idCardMatch.index! });
    }

    return {
      matches,
      piiMatches,
      hasBlock: matches.some(m => m.category === 'banned'),
      hasWarning: matches.some(m => m.category === 'warning'),
      hasPII: piiMatches.length > 0,
    };
  },
}));

mock.module('../../../../src/services/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

// dev mode: requireRole auto-passes when no X-User-Id header
mock.module('../../../../src/services/auth', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

// ── App setup ────────────────────────────────────────────────────────────────

let app: Hono;

beforeEach(async () => {
  mockKeywords = [
    { id: 'kw1', keyword: '辱骂', category: 'banned', description: '辱骂词' },
    { id: 'kw2', keyword: '投诉升级', category: 'warning', description: '预警词' },
    { id: 'kw3', keyword: '身份证号', category: 'pii', description: 'PII' },
  ];
  nextId = 100;

  const mod = await import('../../../../src/agent/card/compliance');
  app = new Hono();
  app.route('/api/compliance', mod.default);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/compliance/keywords', () => {
  test('returns keywords array and total count', async () => {
    const { status, body } = await getJSON(app, '/api/compliance/keywords');
    expect(status).toBe(200);
    const b = body as any;
    expect(Array.isArray(b.keywords)).toBe(true);
    expect(b.total).toBe(3);
    expect(b.keywords[0]).toHaveProperty('id');
    expect(b.keywords[0]).toHaveProperty('keyword');
    expect(b.keywords[0]).toHaveProperty('category');
  });
});

describe('POST /api/compliance/keywords', () => {
  test('returns 400 when keyword is missing', async () => {
    const { status, body } = await postJSON(app, '/api/compliance/keywords', { category: 'banned' });
    expect(status).toBe(400);
    expect((body as any).error).toContain('keyword');
  });

  test('returns 400 when category is invalid', async () => {
    const { status, body } = await postJSON(app, '/api/compliance/keywords', { keyword: '测试', category: 'invalid' });
    expect(status).toBe(400);
    expect((body as any).error).toContain('category');
  });

  test('creates banned keyword successfully', async () => {
    const { status, body } = await postJSON(app, '/api/compliance/keywords', {
      keyword: '脏话', category: 'banned', description: '新增禁用词',
    });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.ok).toBe(true);
    expect(b.keyword.keyword).toBe('脏话');
    expect(b.keyword.category).toBe('banned');
    expect(b.keyword.id).toMatch(/^custom_/);
  });

  test('creates warning keyword successfully', async () => {
    const { status, body } = await postJSON(app, '/api/compliance/keywords', {
      keyword: '领导', category: 'warning',
    });
    expect(status).toBe(200);
    expect((body as any).keyword.category).toBe('warning');
  });

  test('creates pii keyword successfully', async () => {
    const { status, body } = await postJSON(app, '/api/compliance/keywords', {
      keyword: '银行卡', category: 'pii',
    });
    expect(status).toBe(200);
    expect((body as any).keyword.category).toBe('pii');
  });
});

describe('DELETE /api/compliance/keywords/:id', () => {
  test('deletes existing keyword and returns ok', async () => {
    const { status, body } = await deleteJSON(app, '/api/compliance/keywords/kw1');
    expect(status).toBe(200);
    expect((body as any).ok).toBe(true);
    expect((body as any).id).toBe('kw1');
  });

  test('returns 404 for non-existent keyword id', async () => {
    const { status, body } = await deleteJSON(app, '/api/compliance/keywords/nonexistent');
    expect(status).toBe(404);
    expect((body as any).error).toContain('未找到');
  });
});

describe('POST /api/compliance/keywords/reload', () => {
  test('reloads AC automaton and returns new total', async () => {
    const { status, body } = await postJSON(app, '/api/compliance/keywords/reload', {});
    expect(status).toBe(200);
    const b = body as any;
    expect(b.ok).toBe(true);
    expect(typeof b.total).toBe('number');
  });
});

describe('POST /api/compliance/check', () => {
  test('returns 400 when text is missing', async () => {
    const { status, body } = await postJSON(app, '/api/compliance/check', {});
    expect(status).toBe(400);
    expect((body as any).error).toContain('text');
  });

  test('detects banned keyword and returns hasBlock:true', async () => {
    const { status, body } = await postJSON(app, '/api/compliance/check', { text: '你辱骂我了' });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.hasBlock).toBe(true);
    expect(b.matches.length).toBeGreaterThan(0);
    expect(b.matches[0].category).toBe('banned');
  });

  test('detects warning keyword and returns hasWarning:true', async () => {
    const { status, body } = await postJSON(app, '/api/compliance/check', { text: '我要投诉升级' });
    expect(status).toBe(200);
    expect((body as any).hasWarning).toBe(true);
  });

  test('detects PII and returns hasPII:true with matches', async () => {
    const { status, body } = await postJSON(app, '/api/compliance/check', { text: '我的身份证号是11010119900101001X' });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.hasPII).toBe(true);
    expect(b.piiMatches.length).toBeGreaterThan(0);
    expect(b.piiMatches[0].type).toBe('id_card');
  });

  test('returns all-false for clean text', async () => {
    const { status, body } = await postJSON(app, '/api/compliance/check', { text: '请帮我查一下话费' });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.hasBlock).toBe(false);
    expect(b.hasWarning).toBe(false);
    expect(b.hasPII).toBe(false);
    expect(b.matches).toEqual([]);
  });
});
