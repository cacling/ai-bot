/**
 * campaigns.ts — 营销活动 CRUD
 */
import { Hono } from 'hono';
import { db, obCampaigns, eq, desc } from '../db';

const router = new Hono();

// GET / — 列表（可选 ?status=active）
router.get('/', async (c) => {
  const status = c.req.query('status');
  const rows = status
    ? db.select().from(obCampaigns).where(eq(obCampaigns.status, status)).orderBy(desc(obCampaigns.created_at)).all()
    : db.select().from(obCampaigns).orderBy(desc(obCampaigns.created_at)).all();
  return c.json({ campaigns: rows });
});

// GET /:campaignId — 详情
router.get('/:campaignId', async (c) => {
  const campaignId = c.req.param('campaignId');
  const rows = db.select().from(obCampaigns).where(eq(obCampaigns.campaign_id, campaignId)).all();
  if (rows.length === 0) return c.json({ error: 'campaign not found' }, 404);
  return c.json(rows[0]);
});

// POST / — 创建
router.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.campaign_id || !body.campaign_name) {
    return c.json({ error: 'campaign_id 和 campaign_name 必填' }, 400);
  }
  try {
    db.insert(obCampaigns).values(body).run();
    return c.json({ ok: true, campaign_id: body.campaign_id }, 201);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return c.json({ error: 'campaign_id 已存在' }, 409);
    }
    throw err;
  }
});

// PUT /:campaignId — 更新
router.put('/:campaignId', async (c) => {
  const campaignId = c.req.param('campaignId');
  const body = await c.req.json();
  const existing = db.select().from(obCampaigns).where(eq(obCampaigns.campaign_id, campaignId)).all();
  if (existing.length === 0) return c.json({ error: 'campaign not found' }, 404);

  const updates: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };
  delete updates.campaign_id; // PK 不可改
  db.update(obCampaigns).set(updates).where(eq(obCampaigns.campaign_id, campaignId)).run();
  return c.json({ ok: true });
});

export default router;
