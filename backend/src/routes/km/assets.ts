/**
 * assets.ts — 知识资产列表/详情/版本链
 */
import { Hono } from 'hono';
import { eq, desc, like, and, SQL } from 'drizzle-orm';
import { db } from '../../db';
import { kmAssets, kmAssetVersions } from '../../db/schema';

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

export default app;
