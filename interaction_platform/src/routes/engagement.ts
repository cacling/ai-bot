/**
 * engagement.ts — Public engagement CRUD + triage trigger
 */
import { Hono } from 'hono';
import { db, ixEngagementItems, ixContentAssets, ixTriageResults, ixModerationActions, eq, desc } from '../db';
import { triageItem } from '../services/triage-engine';
import { bridgeToPrivate } from '../services/public-private-bridge';

const router = new Hono();

/** GET /items — List engagement items */
router.get('/items', async (c) => {
  const status = c.req.query('status');
  const provider = c.req.query('provider');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);

  let query = db.select().from(ixEngagementItems).$dynamic();
  if (status) query = query.where(eq(ixEngagementItems.status, status));
  if (provider) query = query.where(eq(ixEngagementItems.provider, provider));

  const rows = await query.orderBy(desc(ixEngagementItems.ingested_at)).limit(limit).all();
  return c.json({ items: rows });
});

/** GET /items/:id — Get engagement item detail */
router.get('/items/:id', async (c) => {
  const item = await db.query.ixEngagementItems.findFirst({
    where: eq(ixEngagementItems.item_id, c.req.param('id')),
  });
  if (!item) return c.json({ error: 'Engagement item not found' }, 404);

  // Include triage results
  const triageResults = await db.select().from(ixTriageResults)
    .where(eq(ixTriageResults.item_id, item.item_id))
    .all();

  // Include moderation actions
  const moderationActions = await db.select().from(ixModerationActions)
    .where(eq(ixModerationActions.item_id, item.item_id))
    .all();

  return c.json({ ...item, triage_results: triageResults, moderation_actions: moderationActions });
});

/** POST /items/:id/triage — Run triage on an engagement item */
router.post('/items/:id/triage', async (c) => {
  const itemId = c.req.param('id');
  const item = await db.query.ixEngagementItems.findFirst({
    where: eq(ixEngagementItems.item_id, itemId),
  });
  if (!item) return c.json({ error: 'Engagement item not found' }, 404);

  const result = await triageItem(itemId);

  // Auto-execute recommendation
  if (result.recommendation === 'materialize' || result.recommendation === 'convert_private') {
    const bridgeResult = await bridgeToPrivate(itemId, {
      priority: result.risk_level === 'critical' ? 10 : result.risk_level === 'high' ? 30 : 50,
    });
    return c.json({ triage: result, bridge: bridgeResult });
  }

  return c.json({ triage: result });
});

/** POST /items/:id/moderate — Apply a moderation action */
router.post('/items/:id/moderate', async (c) => {
  const itemId = c.req.param('id');
  const body = await c.req.json<{
    action_type: string;
    actor_id?: string;
    content?: string;
    reason?: string;
  }>();

  if (!body.action_type) return c.json({ error: 'action_type is required' }, 400);

  const actionId = crypto.randomUUID();
  await db.insert(ixModerationActions).values({
    action_id: actionId,
    item_id: itemId,
    action_type: body.action_type,
    actor_type: body.actor_id ? 'agent' : 'system',
    actor_id: body.actor_id ?? null,
    content: body.content ?? null,
    reason: body.reason ?? null,
  });

  return c.json({ action_id: actionId }, 201);
});

/** GET /assets — List content assets */
router.get('/assets', async (c) => {
  const provider = c.req.query('provider');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);

  let query = db.select().from(ixContentAssets).$dynamic();
  if (provider) query = query.where(eq(ixContentAssets.provider, provider));

  const rows = await query.orderBy(desc(ixContentAssets.ingested_at)).limit(limit).all();
  return c.json({ items: rows });
});

/** GET /triage — List triage results */
router.get('/triage', async (c) => {
  const recommendation = c.req.query('recommendation');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);

  let query = db.select().from(ixTriageResults).$dynamic();
  if (recommendation) query = query.where(eq(ixTriageResults.recommendation, recommendation));

  const rows = await query.orderBy(desc(ixTriageResults.created_at)).limit(limit).all();
  return c.json({ items: rows });
});

export default router;
