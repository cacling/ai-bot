/**
 * documents.ts — 文档管理 CRUD + 触发作业
 */
import { Hono } from 'hono';
import { eq, desc, like, and, SQL } from 'drizzle-orm';
import { db } from '../../../db';
import { kmDocuments, kmDocVersions, kmPipelineJobs } from '../../../db/schema';
import { logger } from '../../../logger';
import { nanoid, writeAudit } from './helpers';

const app = new Hono();

// GET / — 文档列表
app.get('/', async (c) => {
  const { keyword, classification, status, page = '1', size = '20' } = c.req.query();
  const conditions: SQL[] = [];
  if (keyword) conditions.push(like(kmDocuments.title, `%${keyword}%`));
  if (classification) conditions.push(eq(kmDocuments.classification, classification));
  if (status) conditions.push(eq(kmDocuments.status, status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(Number(size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const rows = await db.select().from(kmDocuments).where(where)
    .orderBy(desc(kmDocuments.updated_at)).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: db.$count(kmDocuments, where) }).from(kmDocuments);

  return c.json({ items: rows, total: count, page: Number(page), size: limit });
});

// GET /:id — 文档详情
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [doc] = await db.select().from(kmDocuments).where(eq(kmDocuments.id, id)).limit(1);
  if (!doc) return c.json({ error: '文档不存在' }, 404);

  const versions = await db.select().from(kmDocVersions)
    .where(eq(kmDocVersions.document_id, id)).orderBy(desc(kmDocVersions.version_no));
  return c.json({ ...doc, versions });
});

// POST / — 创建文档
app.post('/', async (c) => {
  const body = await c.req.json<{
    title: string; source?: string; classification?: string; owner?: string;
    effective_from?: string; effective_to?: string; scope_json?: string;
  }>();
  if (!body.title?.trim()) return c.json({ error: '标题不能为空' }, 400);

  const docId = nanoid();
  const versionId = nanoid();
  const now = new Date().toISOString();

  await db.insert(kmDocuments).values({
    id: docId, title: body.title.trim(),
    source: body.source ?? 'upload',
    classification: body.classification ?? 'internal',
    owner: body.owner, created_at: now, updated_at: now,
  });
  await db.insert(kmDocVersions).values({
    id: versionId, document_id: docId, version_no: 1,
    scope_json: body.scope_json,
    effective_from: body.effective_from, effective_to: body.effective_to,
    status: 'draft', created_at: now,
  });

  await writeAudit({ action: 'create_document', object_type: 'document', object_id: docId, detail: { title: body.title } });
  logger.info('km', 'document_created', { docId, title: body.title });
  return c.json({ id: docId, version_id: versionId }, 201);
});

// PUT /:id — 更新文档元信息
app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ title?: string; classification?: string; owner?: string; status?: string }>();
  const now = new Date().toISOString();
  await db.update(kmDocuments).set({ ...body, updated_at: now }).where(eq(kmDocuments.id, id));
  return c.json({ ok: true });
});

// POST /:id/versions — 新建版本
app.post('/:id/versions', async (c) => {
  const docId = c.req.param('id');
  const body = await c.req.json<{
    scope_json?: string; effective_from?: string; effective_to?: string; diff_summary?: string;
  }>();

  // 获取当前最大版本号
  const existing = await db.select({ v: kmDocVersions.version_no }).from(kmDocVersions)
    .where(eq(kmDocVersions.document_id, docId)).orderBy(desc(kmDocVersions.version_no)).limit(1);
  const nextVersion = (existing[0]?.v ?? 0) + 1;

  const versionId = nanoid();
  await db.insert(kmDocVersions).values({
    id: versionId, document_id: docId, version_no: nextVersion,
    scope_json: body.scope_json, effective_from: body.effective_from,
    effective_to: body.effective_to, diff_summary: body.diff_summary,
    status: 'draft', created_at: new Date().toISOString(),
  });
  await db.update(kmDocuments).set({ updated_at: new Date().toISOString() }).where(eq(kmDocuments.id, docId));

  return c.json({ id: versionId, version_no: nextVersion }, 201);
});

// POST /versions/:vid/parse — 触发流水线作业
app.post('/versions/:vid/parse', async (c) => {
  const vid = c.req.param('vid');
  const body = await c.req.json<{ stages?: string[] }>().catch(() => ({ stages: undefined }));
  const stages = body.stages ?? ['parse', 'chunk', 'generate', 'validate'];

  const jobs: { id: string; stage: string }[] = [];
  for (const stage of stages) {
    const jobId = nanoid();
    await db.insert(kmPipelineJobs).values({
      id: jobId, doc_version_id: vid, stage, status: 'pending',
      created_at: new Date().toISOString(),
    });
    jobs.push({ id: jobId, stage });
  }

  await db.update(kmDocVersions).set({ status: 'parsing' }).where(eq(kmDocVersions.id, vid));

  logger.info('km', 'parse_triggered', { vid, stages });
  return c.json({ jobs }, 201);
});

export default app;
