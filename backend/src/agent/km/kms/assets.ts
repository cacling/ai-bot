/**
 * assets.ts — 知识资产列表/详情/版本链
 */
import { Hono } from 'hono';
import { eq, desc, like, and, SQL, sql } from 'drizzle-orm';
import { db } from '../../../db';
import { kmAssets, kmAssetVersions, kmReplyFeedback } from '../../../db/schema';

const app = new Hono();

// GET / — 资产列表
app.get('/', async (c) => {
  const { status, asset_type, keyword, page = '1', size = '20' } = c.req.query();
  const conditions: SQL[] = [];
  if (status) conditions.push(eq(kmAssets.status, status));
  if (asset_type) conditions.push(eq(kmAssets.asset_type, asset_type));
  if (keyword) conditions.push(like(kmAssets.title, `%${keyword}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(Number(size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const rows = await db.select().from(kmAssets).where(where)
    .orderBy(desc(kmAssets.updated_at)).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: db.$count(kmAssets, where) }).from(kmAssets);
  return c.json({ items: rows, total: count, page: Number(page), size: limit });
});

// GET /:id — 资产详情
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [asset] = await db.select().from(kmAssets).where(eq(kmAssets.id, id)).limit(1);
  if (!asset) return c.json({ error: '资产不存在' }, 404);
  return c.json(asset);
});

// GET /:id/versions — 版本链
app.get('/:id/versions', async (c) => {
  const id = c.req.param('id');
  const versions = await db.select().from(kmAssetVersions)
    .where(eq(kmAssetVersions.asset_id, id))
    .orderBy(desc(kmAssetVersions.version_no));
  return c.json({ items: versions });
});

// GET /:id/metrics — 聚合运行指标
app.get('/:id/metrics', async (c) => {
  const id = c.req.param('id');
  // Get all version IDs for this asset
  const versions = await db.select({ id: kmAssetVersions.id }).from(kmAssetVersions)
    .where(eq(kmAssetVersions.asset_id, id));
  const versionIds = versions.map(v => v.id);
  if (versionIds.length === 0) {
    return c.json({ total_shown: 0, total_used: 0, total_edited: 0, total_dismissed: 0, adopt_rate: 0, edit_rate: 0, dismiss_rate: 0 });
  }

  const feedbacks = await db.select({
    event_type: kmReplyFeedback.event_type,
    cnt: sql<number>`count(*)`,
  }).from(kmReplyFeedback)
    .where(sql`${kmReplyFeedback.asset_version_id} IN (${sql.join(versionIds.map(v => sql`${v}`), sql`, `)})`)
    .groupBy(kmReplyFeedback.event_type);

  const counts: Record<string, number> = {};
  for (const r of feedbacks) counts[r.event_type] = Number(r.cnt);

  const totalShown = counts['shown'] ?? 0;
  const totalUsed = (counts['use'] ?? 0) + (counts['adopt_direct'] ?? 0);
  const totalEdited = (counts['edit'] ?? 0) + (counts['adopt_with_edit'] ?? 0);
  const totalDismissed = counts['dismiss'] ?? 0;
  const total = totalShown || 1;

  return c.json({
    total_shown: totalShown,
    total_used: totalUsed,
    total_edited: totalEdited,
    total_dismissed: totalDismissed,
    adopt_rate: totalUsed / total,
    edit_rate: totalEdited / total,
    dismiss_rate: totalDismissed / total,
  });
});

export default app;
