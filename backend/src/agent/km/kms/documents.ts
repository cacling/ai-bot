/**
 * documents.ts — 文档管理 CRUD + 触发作业
 */
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { eq, desc, like, and, SQL, inArray } from 'drizzle-orm';
import { db } from '../../../db';
import { kmDocuments, kmDocVersions, kmDocChunks, kmPipelineJobs, kmCandidates } from '../../../db/schema';
import { logger } from '../../../services/logger';
import { nanoid, writeAudit } from './helpers';

const app = new Hono();
const BACKEND_ROOT = resolve(import.meta.dir, '../../../../');

function resolveDocContentPath(filePath: string | null): string | null {
  if (!filePath) return null;
  if (isAbsolute(filePath)) return filePath;

  const cwdResolved = resolve(process.cwd(), filePath);
  if (existsSync(cwdResolved)) return cwdResolved;

  const backendResolved = resolve(BACKEND_ROOT, filePath);
  if (existsSync(backendResolved)) return backendResolved;

  return cwdResolved;
}

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

// GET /versions/:vid/content — 获取文档版本正文（Markdown）
app.get('/versions/:vid/content', async (c) => {
  const vid = c.req.param('vid');
  const [version] = await db.select().from(kmDocVersions).where(eq(kmDocVersions.id, vid)).limit(1);
  if (!version) return c.json({ error: '文档版本不存在' }, 404);
  if (!version.file_path) return c.json({ error: '当前版本未关联文档文件' }, 404);

  const resolvedPath = resolveDocContentPath(version.file_path);
  if (!resolvedPath || !existsSync(resolvedPath)) {
    return c.json({ error: '文档文件不存在' }, 404);
  }

  const content = await readFile(resolvedPath, 'utf-8');
  return c.json({
    id: version.id,
    document_id: version.document_id,
    version_no: version.version_no,
    file_path: version.file_path,
    resolved_path: resolvedPath,
    format: 'markdown',
    content,
  });
});

// GET /:id — 文档详情
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [doc] = await db.select().from(kmDocuments).where(eq(kmDocuments.id, id)).limit(1);
  if (!doc) return c.json({ error: '文档不存在' }, 404);

  const versions = await db.select().from(kmDocVersions)
    .where(eq(kmDocVersions.document_id, id)).orderBy(desc(kmDocVersions.version_no));
  const versionIds = versions.map((version) => version.id);
  const linkedCandidates = versionIds.length === 0
    ? []
    : await db.select({
      id: kmCandidates.id,
      normalized_q: kmCandidates.normalized_q,
      category: kmCandidates.category,
      source_type: kmCandidates.source_type,
      source_ref_id: kmCandidates.source_ref_id,
      status: kmCandidates.status,
      risk_level: kmCandidates.risk_level,
      scene_code: kmCandidates.scene_code,
      updated_at: kmCandidates.updated_at,
    }).from(kmCandidates)
      .where(inArray(kmCandidates.source_ref_id, versionIds))
      .orderBy(desc(kmCandidates.updated_at));

  return c.json({ ...doc, versions, linked_candidates: linkedCandidates });
});

// POST / — 创建文档
app.post('/', async (c) => {
  const body = await c.req.json<{
    title: string; source?: string; classification?: string; owner?: string;
    authority_level?: string; applicable_scope?: string; citation_ready?: boolean;
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
    authority_level: body.authority_level ?? 'rule',
    applicable_scope: body.applicable_scope,
    citation_ready: body.citation_ready ? 1 : 0,
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
  const body = await c.req.json<{
    title?: string; classification?: string; owner?: string; status?: string;
    authority_level?: string; applicable_scope?: string; citation_ready?: boolean;
  }>();
  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { ...body, updated_at: now };
  if (body.citation_ready !== undefined) updateData.citation_ready = body.citation_ready ? 1 : 0;
  await db.update(kmDocuments).set(updateData).where(eq(kmDocuments.id, id));
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

// GET /versions/:vid/chunks — 获取版本切块列表
app.get('/versions/:vid/chunks', async (c) => {
  const vid = c.req.param('vid');
  const chunks = await db.select().from(kmDocChunks)
    .where(eq(kmDocChunks.doc_version_id, vid))
    .orderBy(kmDocChunks.chunk_index);
  return c.json({ items: chunks });
});

// POST /versions/:vid/chunks — 手动创建切块
app.post('/versions/:vid/chunks', async (c) => {
  const vid = c.req.param('vid');
  const body = await c.req.json<{
    chunks: Array<{ chunk_text: string; anchor_type?: string; anchor_value?: string; citation_label?: string }>;
  }>();
  if (!body.chunks?.length) return c.json({ error: 'chunks array is required' }, 400);

  const now = new Date().toISOString();
  const ids: string[] = [];
  for (let i = 0; i < body.chunks.length; i++) {
    const chunk = body.chunks[i];
    const id = nanoid();
    ids.push(id);
    await db.insert(kmDocChunks).values({
      id,
      doc_version_id: vid,
      chunk_index: i,
      chunk_text: chunk.chunk_text,
      anchor_type: chunk.anchor_type,
      anchor_value: chunk.anchor_value,
      citation_label: chunk.citation_label,
      created_at: now,
    });
  }
  await db.update(kmDocVersions).set({ chunk_count: body.chunks.length }).where(eq(kmDocVersions.id, vid));

  logger.info('km', 'chunks_created', { vid, count: body.chunks.length });
  return c.json({ ids }, 201);
});

// POST /versions/:vid/auto-chunk — 自动从 Markdown 按标题拆分切块
app.post('/versions/:vid/auto-chunk', async (c) => {
  const vid = c.req.param('vid');
  const [version] = await db.select().from(kmDocVersions).where(eq(kmDocVersions.id, vid)).limit(1);
  if (!version) return c.json({ error: '版本不存在' }, 404);
  if (!version.file_path) return c.json({ error: '未关联文档文件' }, 404);

  const resolvedPath = resolveDocContentPath(version.file_path);
  if (!resolvedPath || !existsSync(resolvedPath)) return c.json({ error: '文件不存在' }, 404);

  const content = await readFile(resolvedPath, 'utf-8');
  const sections = content.split(/^(#{1,3}\s+.+)$/m).filter(Boolean);

  // Delete existing chunks for this version
  await db.delete(kmDocChunks).where(eq(kmDocChunks.doc_version_id, vid));

  const now = new Date().toISOString();
  let chunkIndex = 0;
  let currentTitle = '';
  const ids: string[] = [];

  for (const section of sections) {
    if (/^#{1,3}\s+/.test(section)) {
      currentTitle = section.replace(/^#+\s+/, '').trim();
      continue;
    }
    const text = section.trim();
    if (!text) continue;

    const id = nanoid();
    ids.push(id);
    await db.insert(kmDocChunks).values({
      id,
      doc_version_id: vid,
      chunk_index: chunkIndex++,
      chunk_text: text,
      anchor_type: 'section',
      anchor_value: currentTitle,
      citation_label: currentTitle || `Chunk ${chunkIndex}`,
      created_at: now,
    });
  }

  await db.update(kmDocVersions).set({ chunk_count: chunkIndex }).where(eq(kmDocVersions.id, vid));
  logger.info('km', 'auto_chunked', { vid, count: chunkIndex });
  return c.json({ count: chunkIndex, ids }, 201);
});

export default app;
