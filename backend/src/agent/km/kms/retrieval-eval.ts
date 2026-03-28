/**
 * retrieval-eval.ts — 检索评测 API
 */
import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../../db';
import { kmRetrievalEvalCases } from '../../../db/schema';
import { searchKnowledgeAssets } from '../../../services/reply-copilot';
import { logger } from '../../../services/logger';

const app = new Hono();

// POST /search — 检索测试
app.post('/search', async (c) => {
  const { query, top_k = 5 } = await c.req.json<{ query: string; top_k?: number }>();
  if (!query) return c.json({ error: 'query 不能为空' }, 400);

  const results = await searchKnowledgeAssets({ query, topK: Math.min(top_k, 20) });
  return c.json({
    results: results.map(r => ({
      asset_id: r.assetId,
      version_id: r.versionId,
      title: r.title,
      score: r.score,
      confidence: r.confidence,
      snippet: (() => {
        try {
          const content = JSON.parse(r.contentSnapshot || '{}');
          return content.q ?? r.title;
        } catch { return r.title; }
      })(),
    })),
  });
});

// GET /cases — 评测样例列表
app.get('/cases', async (c) => {
  const { page = '1', size = '20' } = c.req.query();
  const limit = Math.min(Number(size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const rows = await db.select().from(kmRetrievalEvalCases)
    .orderBy(desc(kmRetrievalEvalCases.created_at))
    .limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: db.$count(kmRetrievalEvalCases) }).from(kmRetrievalEvalCases);

  return c.json({ items: rows, total: count, page: Number(page), size: limit });
});

// POST /cases — 保存评测样例
app.post('/cases', async (c) => {
  const body = await c.req.json<{
    input_text: string;
    input_kind?: string;
    expected_asset_ids?: string[];
    actual_asset_ids?: string[];
    actual_answer?: string;
  }>();
  if (!body.input_text) return c.json({ error: 'input_text 不能为空' }, 400);

  const id = crypto.randomUUID();
  await db.insert(kmRetrievalEvalCases).values({
    id,
    input_text: body.input_text,
    input_kind: body.input_kind ?? 'user_message',
    expected_asset_ids: body.expected_asset_ids ? JSON.stringify(body.expected_asset_ids) : null,
    actual_asset_ids: body.actual_asset_ids ? JSON.stringify(body.actual_asset_ids) : null,
    actual_answer: body.actual_answer ?? null,
  });

  logger.info('retrieval-eval', 'case_created', { id });
  return c.json({ id }, 201);
});

// PUT /cases/:id — 更新评测结果
app.put('/cases/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    citation_ok?: number;
    answer_ok?: number;
    reviewer?: string;
    expected_asset_ids?: string[];
    actual_asset_ids?: string[];
    actual_answer?: string;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.citation_ok !== undefined) updates.citation_ok = body.citation_ok;
  if (body.answer_ok !== undefined) updates.answer_ok = body.answer_ok;
  if (body.reviewer !== undefined) updates.reviewer = body.reviewer;
  if (body.expected_asset_ids) updates.expected_asset_ids = JSON.stringify(body.expected_asset_ids);
  if (body.actual_asset_ids) updates.actual_asset_ids = JSON.stringify(body.actual_asset_ids);
  if (body.actual_answer !== undefined) updates.actual_answer = body.actual_answer;

  if (Object.keys(updates).length === 0) return c.json({ error: '无更新字段' }, 400);

  await db.update(kmRetrievalEvalCases).set(updates).where(eq(kmRetrievalEvalCases.id, id));
  logger.info('retrieval-eval', 'case_updated', { id });
  return c.json({ ok: true });
});

export default app;
