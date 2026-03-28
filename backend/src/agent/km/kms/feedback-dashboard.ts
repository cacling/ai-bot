/**
 * feedback-dashboard.ts — 反馈与缺口聚合 API
 */
import { Hono } from 'hono';
import { eq, desc, sql, and, SQL } from 'drizzle-orm';
import { db } from '../../../db';
import { kmReplyFeedback, kmCandidates, kmGovernanceTasks } from '../../../db/schema';
import { logger } from '../../../services/logger';

const app = new Hono();

// GET /overview — 聚合指标概览
app.get('/overview', async (c) => {
  const rows = await db.select({
    event_type: kmReplyFeedback.event_type,
    cnt: sql<number>`count(*)`,
  }).from(kmReplyFeedback).groupBy(kmReplyFeedback.event_type);

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.event_type] = Number(r.cnt);

  const totalShown = counts['shown'] ?? 0;
  const totalUsed = (counts['use'] ?? 0) + (counts['adopt_direct'] ?? 0);
  const totalEdited = (counts['edit'] ?? 0) + (counts['adopt_with_edit'] ?? 0);
  const totalDismissed = counts['dismiss'] ?? 0;
  const totalNotHelpful = counts['not_helpful'] ?? 0;
  const total = totalShown || 1;

  return c.json({
    total_shown: totalShown,
    total_used: totalUsed,
    total_edited: totalEdited,
    total_dismissed: totalDismissed,
    total_not_helpful: totalNotHelpful,
    adopt_rate: totalUsed / total,
    edit_rate: totalEdited / total,
    dismiss_rate: totalDismissed / total,
    not_helpful_rate: totalNotHelpful / total,
  });
});

// GET /details — 反馈明细列表
app.get('/details', async (c) => {
  const { feedback_scope, event_type, page = '1', size = '20' } = c.req.query();
  const conditions: SQL[] = [];
  if (feedback_scope) conditions.push(eq(kmReplyFeedback.feedback_scope, feedback_scope));
  if (event_type) conditions.push(eq(kmReplyFeedback.event_type, event_type));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const limit = Math.min(Number(size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const rows = await db.select().from(kmReplyFeedback).where(where)
    .orderBy(desc(kmReplyFeedback.created_at))
    .limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: db.$count(kmReplyFeedback, where) }).from(kmReplyFeedback);

  return c.json({ items: rows, total: count, page: Number(page), size: limit });
});

// GET /gaps — 知识缺口聚合
app.get('/gaps', async (c) => {
  const { page = '1', size = '20' } = c.req.query();
  const limit = Math.min(Number(size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  // Aggregate dismiss/not_helpful by question_text
  const gaps = await db.select({
    question_text: kmReplyFeedback.question_text,
    cnt: sql<number>`count(*)`,
    latest: sql<string>`max(${kmReplyFeedback.created_at})`,
  }).from(kmReplyFeedback)
    .where(
      and(
        sql`${kmReplyFeedback.event_type} IN ('dismiss', 'not_helpful')`,
        sql`${kmReplyFeedback.question_text} IS NOT NULL AND ${kmReplyFeedback.question_text} != ''`,
      ),
    )
    .groupBy(kmReplyFeedback.question_text)
    .orderBy(sql`count(*) DESC`)
    .limit(limit).offset(offset);

  return c.json({
    items: gaps.map((g, i) => ({
      id: `gap-${offset + i}`,
      question_text: g.question_text,
      count: g.cnt,
      latest_at: g.latest,
    })),
  });
});

// POST /gaps/:id/create-candidate — 从缺口创建候选
app.post('/gaps/create-candidate', async (c) => {
  const { question_text } = await c.req.json<{ question_text: string }>();
  if (!question_text) return c.json({ error: 'question_text 不能为空' }, 400);

  const id = crypto.randomUUID();
  await db.insert(kmCandidates).values({
    id,
    source_type: 'feedback_gap',
    source_ref_id: 'feedback-dashboard',
    normalized_q: question_text,
    risk_level: 'medium',
    status: 'draft',
    gate_evidence: 'pending',
    gate_conflict: 'pending',
    gate_ownership: 'pending',
  });

  logger.info('feedback-dashboard', 'candidate_from_gap', { id, question_text });
  return c.json({ id }, 201);
});

// POST /gaps/create-task — 从缺口创建治理任务
app.post('/gaps/create-task', async (c) => {
  const { question_text } = await c.req.json<{ question_text: string }>();
  if (!question_text) return c.json({ error: 'question_text 不能为空' }, 400);

  const id = crypto.randomUUID();
  await db.insert(kmGovernanceTasks).values({
    id,
    task_type: 'content_gap',
    source_kind: 'feedback',
    issue_category: 'content_gap',
    severity: 'medium',
    priority: 'medium',
    status: 'open',
    conclusion: `知识缺口：${question_text}`,
  });

  logger.info('feedback-dashboard', 'task_from_gap', { id, question_text });
  return c.json({ id }, 201);
});

export default app;
