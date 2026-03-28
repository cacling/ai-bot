/**
 * feedback-dashboard.test.ts — Hono route tests for feedback dashboard
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import { db } from '../../../../../src/db';
import { kmReplyFeedback, kmCandidates, kmGovernanceTasks } from '../../../../../src/db/schema';
import { eq } from 'drizzle-orm';
import feedbackDashboard from '../../../../../src/agent/km/kms/feedback-dashboard';

const app = new Hono();
app.route('/feedback-dashboard', feedbackDashboard);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('feedback-dashboard route', () => {
  // Seed some feedback data
  test('seed test feedback', async () => {
    const now = new Date().toISOString();
    const feedbacks = [
      { id: `fb-test-${Date.now()}-1`, session_id: 's1', phone: '13800000001', event_type: 'shown', feedback_scope: 'reply_hint', created_at: now },
      { id: `fb-test-${Date.now()}-2`, session_id: 's1', phone: '13800000001', event_type: 'adopt_direct', feedback_scope: 'reply_hint', created_at: now },
      { id: `fb-test-${Date.now()}-3`, session_id: 's2', phone: '13800000002', event_type: 'dismiss', feedback_scope: 'kb_answer', question_text: '如何查话费', created_at: now },
      { id: `fb-test-${Date.now()}-4`, session_id: 's3', phone: '13800000003', event_type: 'dismiss', feedback_scope: 'reply_hint', question_text: '如何查话费', created_at: now },
      { id: `fb-test-${Date.now()}-5`, session_id: 's4', phone: '13800000004', event_type: 'not_helpful', feedback_scope: 'kb_answer', question_text: '怎么退订套餐', created_at: now },
    ];
    for (const fb of feedbacks) {
      await db.insert(kmReplyFeedback).values(fb);
    }
  });

  test('GET /overview — returns aggregated metrics', async () => {
    const { status, data } = await req('GET', '/feedback-dashboard/overview');
    expect(status).toBe(200);
    expect(typeof data.total_shown).toBe('number');
    expect(typeof data.adopt_rate).toBe('number');
    expect(typeof data.dismiss_rate).toBe('number');
    expect(typeof data.not_helpful_rate).toBe('number');
  });

  test('GET /details — returns feedback list', async () => {
    const { status, data } = await req('GET', '/feedback-dashboard/details');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  test('GET /details — filter by feedback_scope', async () => {
    const { status, data } = await req('GET', '/feedback-dashboard/details?feedback_scope=reply_hint');
    expect(status).toBe(200);
    const items = data.items as Array<{ feedback_scope: string }>;
    for (const item of items) {
      expect(item.feedback_scope).toBe('reply_hint');
    }
  });

  test('GET /details — filter by event_type', async () => {
    const { status, data } = await req('GET', '/feedback-dashboard/details?event_type=dismiss');
    expect(status).toBe(200);
    const items = data.items as Array<{ event_type: string }>;
    for (const item of items) {
      expect(item.event_type).toBe('dismiss');
    }
  });

  test('GET /details — pagination', async () => {
    const { status, data } = await req('GET', '/feedback-dashboard/details?page=1&size=2');
    expect(status).toBe(200);
    expect(data.page).toBe(1);
    expect(data.size).toBe(2);
  });

  test('GET /gaps — returns aggregated gaps', async () => {
    const { status, data } = await req('GET', '/feedback-dashboard/gaps');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
    const items = data.items as Array<{ question_text: string; count: number }>;
    // Should have at least the seeded gap questions
    if (items.length > 0) {
      expect(items[0].question_text).toBeDefined();
      expect(typeof items[0].count).toBe('number');
    }
  });

  test('POST /gaps/create-candidate — creates candidate from gap', async () => {
    const { status, data } = await req('POST', '/feedback-dashboard/gaps/create-candidate', {
      question_text: '如何办理携号转网',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();

    // Verify in DB
    const [row] = await db.select().from(kmCandidates).where(eq(kmCandidates.id, data.id as string)).limit(1);
    expect(row.normalized_q).toBe('如何办理携号转网');
    expect(row.source_type).toBe('feedback_gap');
  });

  test('POST /gaps/create-candidate — rejects empty question', async () => {
    const { status } = await req('POST', '/feedback-dashboard/gaps/create-candidate', { question_text: '' });
    expect(status).toBe(400);
  });

  test('POST /gaps/create-task — creates governance task from gap', async () => {
    const { status, data } = await req('POST', '/feedback-dashboard/gaps/create-task', {
      question_text: '宽带安装进度查询',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();

    // Verify in DB
    const [row] = await db.select().from(kmGovernanceTasks).where(eq(kmGovernanceTasks.id, data.id as string)).limit(1);
    expect(row.task_type).toBe('content_gap');
    expect(row.source_kind).toBe('feedback');
    expect(row.issue_category).toBe('content_gap');
  });

  test('POST /gaps/create-task — rejects empty question', async () => {
    const { status } = await req('POST', '/feedback-dashboard/gaps/create-task', { question_text: '' });
    expect(status).toBe(400);
  });
});
