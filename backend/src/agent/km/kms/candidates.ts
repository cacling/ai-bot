/**
 * candidates.ts — 知识候选 CRUD + 门槛校验
 */
import { Hono } from 'hono';
import { eq, desc, and, like, SQL } from 'drizzle-orm';
import { db } from '../../../db';
import { kmCandidates, kmEvidenceRefs, kmConflictRecords } from '../../../db/schema';
import { logger } from '../../../logger';
import { nanoid, writeAudit } from './helpers';

const app = new Hono();

// GET / — 候选列表
app.get('/', async (c) => {
  const { status, source_type, gate_evidence, keyword, page = '1', size = '20' } = c.req.query();
  const conditions: SQL[] = [];
  if (status) conditions.push(eq(kmCandidates.status, status));
  if (source_type) conditions.push(eq(kmCandidates.source_type, source_type));
  if (gate_evidence) conditions.push(eq(kmCandidates.gate_evidence, gate_evidence));
  if (keyword) conditions.push(like(kmCandidates.normalized_q, `%${keyword}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(Number(size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const rows = await db.select().from(kmCandidates).where(where)
    .orderBy(desc(kmCandidates.updated_at)).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: db.$count(kmCandidates, where) }).from(kmCandidates);

  return c.json({ items: rows, total: count, page: Number(page), size: limit });
});

// GET /:id — 候选详情（含门槛体检卡）
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [candidate] = await db.select().from(kmCandidates).where(eq(kmCandidates.id, id)).limit(1);
  if (!candidate) return c.json({ error: '候选不存在' }, 404);

  // 证据列表
  const evidences = await db.select().from(kmEvidenceRefs)
    .where(eq(kmEvidenceRefs.candidate_id, id));

  // 冲突列表
  const conflicts = await db.select().from(kmConflictRecords)
    .where(eq(kmConflictRecords.item_a_id, id));
  const conflictsB = await db.select().from(kmConflictRecords)
    .where(eq(kmConflictRecords.item_b_id, id));

  // 门槛体检卡
  const gateCard = {
    evidence: { status: candidate.gate_evidence, details: evidences },
    conflict: {
      status: candidate.gate_conflict,
      details: [...conflicts, ...conflictsB].filter(c => c.status === 'pending'),
    },
    ownership: {
      status: candidate.gate_ownership,
      has_target: !!candidate.target_asset_id,
    },
  };

  return c.json({ ...candidate, evidences, conflicts: [...conflicts, ...conflictsB], gate_card: gateCard });
});

// POST / — 创建候选
app.post('/', async (c) => {
  const body = await c.req.json<{
    source_type: string; source_ref_id?: string; normalized_q: string;
    draft_answer?: string; variants_json?: string; category?: string;
    risk_level?: string; target_asset_id?: string; created_by?: string;
  }>();
  if (!body.normalized_q?.trim()) return c.json({ error: '标准问句不能为空' }, 400);

  const id = nanoid();
  const now = new Date().toISOString();
  await db.insert(kmCandidates).values({
    id, source_type: body.source_type || 'manual',
    source_ref_id: body.source_ref_id,
    normalized_q: body.normalized_q.trim(),
    draft_answer: body.draft_answer, variants_json: body.variants_json,
    category: body.category, risk_level: body.risk_level ?? 'low',
    target_asset_id: body.target_asset_id,
    gate_ownership: body.target_asset_id ? 'pass' : (body.source_type === 'parsing' ? 'pass' : 'pending'),
    created_by: body.created_by, created_at: now, updated_at: now,
  });

  logger.info('km', 'candidate_created', { id, q: body.normalized_q });
  return c.json({ id }, 201);
});

// PUT /:id — 更新候选
app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const now = new Date().toISOString();
  // 只允许更新指定字段
  const allowed = ['normalized_q', 'draft_answer', 'variants_json', 'category', 'risk_level', 'target_asset_id', 'status'];
  const updates: Record<string, unknown> = { updated_at: now };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  if (body.target_asset_id) updates.gate_ownership = 'pass';
  await db.update(kmCandidates).set(updates).where(eq(kmCandidates.id, id));
  return c.json({ ok: true });
});

// POST /:id/gate-check — 重新校验门槛
app.post('/:id/gate-check', async (c) => {
  const id = c.req.param('id');
  const [candidate] = await db.select().from(kmCandidates).where(eq(kmCandidates.id, id)).limit(1);
  if (!candidate) return c.json({ error: '候选不存在' }, 404);

  // 1. 证据门槛：检查是否有 pass 状态的证据
  const passEvidence = await db.select().from(kmEvidenceRefs)
    .where(and(eq(kmEvidenceRefs.candidate_id, id), eq(kmEvidenceRefs.status, 'pass'))).limit(1);
  const gateEvidence = passEvidence.length > 0 ? 'pass' : 'fail';

  // 2. 冲突门槛：检查是否有未仲裁的阻断级冲突
  const pendingConflicts = await db.select().from(kmConflictRecords)
    .where(and(
      eq(kmConflictRecords.status, 'pending'),
      eq(kmConflictRecords.item_a_id, id),
    ));
  const pendingConflictsB = await db.select().from(kmConflictRecords)
    .where(and(
      eq(kmConflictRecords.status, 'pending'),
      eq(kmConflictRecords.item_b_id, id),
    ));
  const blockingConflicts = [...pendingConflicts, ...pendingConflictsB]
    .filter(c => c.blocking_policy === 'block_submit' || c.blocking_policy === 'block_publish');
  const gateConflict = blockingConflicts.length === 0 ? 'pass' : 'fail';

  // 3. 归属门槛
  const gateOwnership = candidate.target_asset_id || candidate.source_type === 'parsing' ? 'pass' : 'pending';

  await db.update(kmCandidates).set({
    gate_evidence: gateEvidence, gate_conflict: gateConflict, gate_ownership: gateOwnership,
    updated_at: new Date().toISOString(),
  }).where(eq(kmCandidates.id, id));

  const allPass = gateEvidence === 'pass' && gateConflict === 'pass' && gateOwnership === 'pass';
  if (allPass && candidate.status === 'draft') {
    await db.update(kmCandidates).set({ status: 'gate_pass' }).where(eq(kmCandidates.id, id));
  }

  logger.info('km', 'gate_check', { id, evidence: gateEvidence, conflict: gateConflict, ownership: gateOwnership });
  return c.json({ gate_evidence: gateEvidence, gate_conflict: gateConflict, gate_ownership: gateOwnership, all_pass: allPass });
});

export default app;
