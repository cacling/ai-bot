/**
 * action-drafts.ts — 动作草案 CRUD + 执行（写回滚点+更新资产+写审计）
 */
import { Hono } from 'hono';
import { eq, desc, and, SQL } from 'drizzle-orm';
import { db } from '../../../db';
import {
  kmActionDrafts, kmAssets, kmAssetVersions,
  kmReviewPackages, kmCandidates, kmRegressionWindows,
} from '../../../db/schema';
import { logger } from '../../../services/logger';
import { nanoid, writeAudit } from './helpers';

const app = new Hono();

// GET /
app.get('/', async (c) => {
  const { status, action_type, page = '1', size = '20' } = c.req.query();
  const conditions: SQL[] = [];
  if (status) conditions.push(eq(kmActionDrafts.status, status));
  if (action_type) conditions.push(eq(kmActionDrafts.action_type, action_type));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(Number(size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const rows = await db.select().from(kmActionDrafts).where(where)
    .orderBy(desc(kmActionDrafts.updated_at)).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: db.$count(kmActionDrafts, where) }).from(kmActionDrafts);
  return c.json({ items: rows, total: count });
});

// GET /:id
app.get('/:id', async (c) => {
  const [row] = await db.select().from(kmActionDrafts).where(eq(kmActionDrafts.id, c.req.param('id'))).limit(1);
  if (!row) return c.json({ error: '草案不存在' }, 404);
  return c.json(row);
});

// POST / — 创建动作草案
app.post('/', async (c) => {
  const body = await c.req.json<{
    action_type: string; target_asset_id?: string; review_pkg_id?: string;
    change_summary?: string; created_by?: string;
  }>();
  const id = nanoid();
  const now = new Date().toISOString();
  await db.insert(kmActionDrafts).values({
    id, action_type: body.action_type,
    target_asset_id: body.target_asset_id,
    review_pkg_id: body.review_pkg_id,
    change_summary: body.change_summary,
    created_by: body.created_by,
    status: 'draft', created_at: now, updated_at: now,
  });
  return c.json({ id }, 201);
});

// POST /:id/execute — 执行草案（核心：写回滚点+更新资产+写审计+创建回归窗口）
app.post('/:id/execute', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ executed_by?: string }>().catch(() => ({} as Record<string, string | undefined>));

  const [draft] = await db.select().from(kmActionDrafts).where(eq(kmActionDrafts.id, id)).limit(1);
  if (!draft) return c.json({ error: '草案不存在' }, 404);
  if (draft.status !== 'draft' && draft.status !== 'reviewed') {
    return c.json({ error: `当前状态 ${draft.status} 不允许执行` }, 400);
  }

  const now = new Date().toISOString();

  // 标记执行中
  await db.update(kmActionDrafts).set({ status: 'executing', updated_at: now }).where(eq(kmActionDrafts.id, id));

  try {
    if (draft.action_type === 'publish' && draft.review_pkg_id) {
      // ── 发布流程 ──
      const [pkg] = await db.select().from(kmReviewPackages)
        .where(eq(kmReviewPackages.id, draft.review_pkg_id)).limit(1);
      if (!pkg) throw new Error('评审包不存在');

      const candidateIds: string[] = pkg.candidate_ids_json ? JSON.parse(pkg.candidate_ids_json) : [];
      const candidates = candidateIds.length > 0
        ? await db.select().from(kmCandidates).where(eq(kmCandidates.review_pkg_id, pkg.id))
        : [];

      for (const cand of candidates) {
        // 若有目标资产 → 更新；否则 → 新建资产
        let assetId = cand.target_asset_id;
        if (assetId) {
          const [asset] = await db.select().from(kmAssets).where(eq(kmAssets.id, assetId)).limit(1);
          if (asset) {
            const newVer = asset.current_version + 1;
            // 回滚点 = 当前版本快照
            const rollbackId = nanoid();
            await db.insert(kmAssetVersions).values({
              id: rollbackId, asset_id: assetId, version_no: newVer,
              content_snapshot: JSON.stringify({ q: cand.normalized_q, a: cand.draft_answer }),
              scope_snapshot: asset.scope_json, action_draft_id: id,
              rollback_point_id: `v${asset.current_version}`,
              effective_from: now, created_at: now,
            });
            await db.update(kmAssets).set({ current_version: newVer, updated_at: now }).where(eq(kmAssets.id, assetId));
          }
        } else {
          assetId = nanoid();
          await db.insert(kmAssets).values({
            id: assetId, title: cand.normalized_q, asset_type: 'qa',
            status: 'online', current_version: 1, owner: cand.created_by,
            created_at: now, updated_at: now,
          });
          await db.insert(kmAssetVersions).values({
            id: nanoid(), asset_id: assetId, version_no: 1,
            content_snapshot: JSON.stringify({ q: cand.normalized_q, a: cand.draft_answer }),
            action_draft_id: id, effective_from: now, created_at: now,
          });
        }

        // 更新候选状态
        await db.update(kmCandidates).set({ status: 'published', updated_at: now }).where(eq(kmCandidates.id, cand.id));
      }

      // 更新评审包状态
      await db.update(kmReviewPackages).set({ status: 'published', updated_at: now }).where(eq(kmReviewPackages.id, pkg.id));

    } else if (draft.action_type === 'unpublish' || draft.action_type === 'downgrade') {
      // ── 下架/降权 ──
      if (draft.target_asset_id) {
        const newStatus = draft.action_type === 'unpublish' ? 'unpublished' : 'downgraded';
        await db.update(kmAssets).set({ status: newStatus, updated_at: now }).where(eq(kmAssets.id, draft.target_asset_id));
      }

    } else if (draft.action_type === 'rollback' && draft.target_asset_id) {
      // ── 回滚 ──
      // 简化实现：标记资产回滚
      await db.update(kmAssets).set({ updated_at: now }).where(eq(kmAssets.id, draft.target_asset_id));
    }

    // 创建回归窗口
    const regWindowId = nanoid();
    await db.insert(kmRegressionWindows).values({
      id: regWindowId, linked_type: 'action_draft', linked_id: id,
      verdict: 'observing', observe_from: now,
      observe_until: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      created_at: now,
    });

    // 完成
    await db.update(kmActionDrafts).set({
      status: 'done', executed_by: body.executed_by, executed_at: now,
      rollback_point_id: `rollback_${id}`,
      regression_window_id: regWindowId,
      updated_at: now,
    }).where(eq(kmActionDrafts.id, id));

    await writeAudit({
      action: `execute_${draft.action_type}`, object_type: 'action_draft', object_id: id,
      operator: body.executed_by, risk_level: 'high',
      detail: { action_type: draft.action_type, target_asset_id: draft.target_asset_id },
    });

    logger.info('km', 'draft_executed', { id, action: draft.action_type });
    return c.json({ ok: true, status: 'done', regression_window_id: regWindowId });

  } catch (err) {
    await db.update(kmActionDrafts).set({ status: 'failed', updated_at: now }).where(eq(kmActionDrafts.id, id));
    logger.error('km', 'draft_execute_failed', { id, error: String(err) });
    return c.json({ error: String(err) }, 500);
  }
});

export default app;
