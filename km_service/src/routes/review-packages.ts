/**
 * review-packages.ts — 评审包 CRUD + 提交门槛阻断 + 审批
 */
import { Hono } from 'hono';
import { eq, desc, inArray, and, SQL } from 'drizzle-orm';
import { db } from '../db';
import { kmReviewPackages, kmCandidates, kmConflictRecords } from '../db';
import { logger } from '../logger';
import { nanoid, writeAudit } from './helpers';

const app = new Hono();

// GET /
app.get('/', async (c) => {
  const { status, page = '1', size = '20' } = c.req.query();
  const conditions: SQL[] = [];
  if (status) conditions.push(eq(kmReviewPackages.status, status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(Number(size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const rows = await db.select().from(kmReviewPackages).where(where)
    .orderBy(desc(kmReviewPackages.updated_at)).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: db.$count(kmReviewPackages, where) }).from(kmReviewPackages);
  return c.json({ items: rows, total: count, page: Number(page), size: limit });
});

// GET /:id
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [pkg] = await db.select().from(kmReviewPackages).where(eq(kmReviewPackages.id, id)).limit(1);
  if (!pkg) return c.json({ error: '评审包不存在' }, 404);

  // 加载包内候选
  const candidateIds: string[] = pkg.candidate_ids_json ? JSON.parse(pkg.candidate_ids_json) : [];
  const candidates = candidateIds.length > 0
    ? await db.select().from(kmCandidates).where(inArray(kmCandidates.id, candidateIds))
    : [];

  return c.json({ ...pkg, candidates });
});

// POST / — 创建评审包
app.post('/', async (c) => {
  const body = await c.req.json<{
    title: string; candidate_ids?: string[]; risk_level?: string;
    impact_summary?: string; created_by?: string;
  }>();
  if (!body.title?.trim()) return c.json({ error: '标题不能为空' }, 400);

  const id = nanoid();
  const now = new Date().toISOString();
  await db.insert(kmReviewPackages).values({
    id, title: body.title.trim(),
    candidate_ids_json: JSON.stringify(body.candidate_ids ?? []),
    risk_level: body.risk_level ?? 'low',
    impact_summary: body.impact_summary,
    created_by: body.created_by,
    status: 'draft', created_at: now, updated_at: now,
  });

  // 更新候选的 review_pkg_id
  if (body.candidate_ids?.length) {
    await db.update(kmCandidates).set({ review_pkg_id: id, status: 'in_review' })
      .where(inArray(kmCandidates.id, body.candidate_ids));
  }

  return c.json({ id }, 201);
});

// POST /:id/submit — 提交评审（触发门槛阻断检查）
app.post('/:id/submit', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ submitted_by?: string }>().catch(() => ({} as Record<string, string | undefined>));

  const [pkg] = await db.select().from(kmReviewPackages).where(eq(kmReviewPackages.id, id)).limit(1);
  if (!pkg) return c.json({ error: '评审包不存在' }, 404);
  if (pkg.status !== 'draft') return c.json({ error: `当前状态 ${pkg.status} 不允许提交` }, 400);

  const candidateIds: string[] = pkg.candidate_ids_json ? JSON.parse(pkg.candidate_ids_json) : [];
  if (candidateIds.length === 0) return c.json({ error: '评审包内没有候选' }, 400);

  // ── 门槛阻断检查 ──
  const candidates = await db.select().from(kmCandidates).where(inArray(kmCandidates.id, candidateIds));
  const blockers: { candidate_id: string; q: string; reasons: string[] }[] = [];

  for (const cand of candidates) {
    const reasons: string[] = [];
    if (cand.gate_evidence !== 'pass') reasons.push('证据未通过');
    if (cand.gate_conflict === 'fail') reasons.push('存在未仲裁的阻断级冲突');
    if (cand.gate_ownership !== 'pass') reasons.push('归属未确认');
    if (reasons.length > 0) {
      blockers.push({ candidate_id: cand.id, q: cand.normalized_q, reasons });
    }
  }

  // 检查冲突阻断
  const conflictBlockers = await db.select().from(kmConflictRecords)
    .where(and(
      eq(kmConflictRecords.status, 'pending'),
      eq(kmConflictRecords.blocking_policy, 'block_submit'),
    ));
  const relatedConflicts = conflictBlockers.filter(c =>
    candidateIds.includes(c.item_a_id) || candidateIds.includes(c.item_b_id)
  );
  if (relatedConflicts.length > 0) {
    for (const conf of relatedConflicts) {
      const existing = blockers.find(b => b.candidate_id === conf.item_a_id || b.candidate_id === conf.item_b_id);
      if (existing && !existing.reasons.includes('冲突阻断送审')) {
        existing.reasons.push('冲突阻断送审');
      }
    }
  }

  if (blockers.length > 0) {
    logger.info('km', 'submit_blocked', { id, blockers: blockers.length });
    return c.json({ error: '门槛检查未通过', blockers }, 400);
  }

  // 通过 → 更新状态
  const now = new Date().toISOString();
  await db.update(kmReviewPackages).set({
    status: 'submitted', submitted_by: body.submitted_by, submitted_at: now,
    approval_snapshot: JSON.stringify({ submitted_by: body.submitted_by, submitted_at: now }),
    updated_at: now,
  }).where(eq(kmReviewPackages.id, id));

  await writeAudit({ action: 'submit_review', object_type: 'review_package', object_id: id, operator: body.submitted_by });
  logger.info('km', 'review_submitted', { id });
  return c.json({ ok: true, status: 'submitted' });
});

// POST /:id/approve — 审批通过
app.post('/:id/approve', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ approved_by?: string }>().catch(() => ({} as Record<string, string | undefined>));
  const now = new Date().toISOString();
  await db.update(kmReviewPackages).set({
    status: 'approved', approved_by: body.approved_by, approved_at: now, updated_at: now,
  }).where(eq(kmReviewPackages.id, id));
  await writeAudit({ action: 'approve_review', object_type: 'review_package', object_id: id, operator: body.approved_by });
  return c.json({ ok: true, status: 'approved' });
});

// POST /:id/reject — 驳回
app.post('/:id/reject', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ rejected_by?: string; reason?: string }>().catch(() => ({} as Record<string, string | undefined>));
  const now = new Date().toISOString();
  await db.update(kmReviewPackages).set({ status: 'rejected', updated_at: now })
    .where(eq(kmReviewPackages.id, id));
  await writeAudit({ action: 'reject_review', object_type: 'review_package', object_id: id, operator: body.rejected_by, detail: { reason: body.reason } });
  return c.json({ ok: true, status: 'rejected' });
});

export default app;
