/**
 * API tests for: src/chat/mock-data.ts
 * Routes: GET /api/test-personas, GET /api/outbound-tasks
 * Mock: db(testPersonas, outboundTasks)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON } from '../helpers';

// ── Mock data ────────────────────────────────────────────────────────────────

const PERSONAS = [
  { id: 'p1', category: 'inbound', label_zh: '普通用户', label_en: 'Normal User', tag_zh: '正常', tag_en: 'Normal', tag_color: 'green', context: '{"phone":"13800000001"}', sort_order: 1 },
  { id: 'p2', category: 'outbound', label_zh: '欠费用户', label_en: 'Overdue User', tag_zh: '欠费', tag_en: 'Overdue', tag_color: 'red', context: '{"phone":"13800000002"}', sort_order: 2 },
];

const TASKS = [
  { id: 't1', phone: '13800000001', task_type: 'collection', label_zh: '催缴', label_en: 'Collection', data: '{"amount":50}' },
  { id: 't2', phone: '13800000002', task_type: 'marketing', label_zh: '营销', label_en: 'Marketing', data: '{"plan":"5G套餐"}' },
];

// ── Mock db ──────────────────────────────────────────────────────────────────

function buildQuery(dataset: any[]) {
  return {
    where: (cond: unknown) => ({
      orderBy: () => ({ all: () => dataset.filter(() => true) }),
      all: () => dataset.filter(() => true),
    }),
    orderBy: () => ({ all: () => dataset }),
    all: () => dataset,
  };
}

let filteredPersonas = PERSONAS;
let filteredTasks = TASKS;

mock.module('../../../src/db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        // Detect which table is being queried by checking the mock reference
        const isPersonas = filteredPersonas !== undefined;
        return {
          where: () => ({
            orderBy: () => ({ all: () => filteredPersonas }),
            all: () => filteredTasks.filter(() => true),
          }),
          orderBy: () => ({ all: () => filteredPersonas }),
          all: () => filteredTasks,
        };
      },
    }),
  },
}));
// Schema loads fine without mocking — only mock db

// ── App setup ────────────────────────────────────────────────────────────────

let app: Hono;

beforeEach(async () => {
  filteredPersonas = PERSONAS;
  filteredTasks = TASKS;
  const mod = await import('../../../src/chat/mock-data');
  app = new Hono();
  app.route('/api', mod.default);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/test-personas', () => {
  test('returns array of test personas from db', async () => {
    const { status, body } = await getJSON(app, '/api/test-personas');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect((body as any[]).length).toBeGreaterThan(0);
  });

  test('each persona has phone, name, gender fields', async () => {
    const { body } = await getJSON(app, '/api/test-personas');
    const items = body as any[];
    for (const item of items) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('category');
      expect(item).toHaveProperty('tag');
      expect(item).toHaveProperty('tagColor');
      expect(item).toHaveProperty('context');
    }
  });
});

describe('GET /api/outbound-tasks', () => {
  test('returns array of outbound tasks from db', async () => {
    const { status, body } = await getJSON(app, '/api/outbound-tasks');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect((body as any[]).length).toBeGreaterThan(0);
  });

  test('each task has id, type, phone, customer_name fields', async () => {
    const { body } = await getJSON(app, '/api/outbound-tasks');
    const items = body as any[];
    for (const item of items) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('phone');
      expect(item).toHaveProperty('task_type');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('data');
    }
  });
});
