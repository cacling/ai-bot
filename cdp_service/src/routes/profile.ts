/**
 * Profile & Summary 路由 — 消费视图管理
 *
 * customer_profile / service_summary / interaction_summary
 * 这些都是派生视图，可重建。
 */
import { Hono } from 'hono';
import {
  db,
  cdpCustomerProfiles,
  cdpServiceSummaries,
  cdpInteractionSummaries,
  eq,
  and,
} from '../db';

const router = new Hono();

// ── Customer Profile ──────────────────────────────────────────────────────

/** GET /profile — 获取 party 的 customer profile */
router.get('/profile', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const partyId = c.req.query('party_id');

  if (!partyId) return c.json({ error: 'party_id is required' }, 400);

  const rows = await db
    .select()
    .from(cdpCustomerProfiles)
    .where(and(eq(cdpCustomerProfiles.tenant_id, tenantId), eq(cdpCustomerProfiles.party_id, partyId)))
    .limit(1);

  if (rows.length === 0) return c.json({ error: 'profile not found' }, 404);
  return c.json(rows[0]);
});

/** PUT /profile — 创建或更新 customer profile（upsert） */
router.put('/profile', async (c) => {
  const body = await c.req.json();
  const { tenant_id = 'default', party_id, ...fields } = body;

  if (!party_id) return c.json({ error: 'party_id is required' }, 400);

  // 检查是否存在
  const existing = await db
    .select()
    .from(cdpCustomerProfiles)
    .where(and(eq(cdpCustomerProfiles.tenant_id, tenant_id), eq(cdpCustomerProfiles.party_id, party_id)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(cdpCustomerProfiles)
      .set({
        ...fields,
        profile_version: (existing[0].profile_version ?? 0) + 1,
        computed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(cdpCustomerProfiles.customer_profile_id, existing[0].customer_profile_id));
    return c.json({ customer_profile_id: existing[0].customer_profile_id, action: 'updated' });
  }

  const customer_profile_id = crypto.randomUUID();
  await db.insert(cdpCustomerProfiles).values({
    customer_profile_id,
    tenant_id,
    party_id,
    ...fields,
  });
  return c.json({ customer_profile_id, action: 'created' }, 201);
});

// ── Service Summary ───────────────────────────────────────────────────────

/** GET /service-summary — 获取 party 的 service summary */
router.get('/service-summary', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const partyId = c.req.query('party_id');

  if (!partyId) return c.json({ error: 'party_id is required' }, 400);

  const rows = await db
    .select()
    .from(cdpServiceSummaries)
    .where(and(eq(cdpServiceSummaries.tenant_id, tenantId), eq(cdpServiceSummaries.party_id, partyId)))
    .limit(1);

  if (rows.length === 0) return c.json({ error: 'service summary not found' }, 404);
  return c.json(rows[0]);
});

/** PUT /service-summary — 创建或更新 service summary */
router.put('/service-summary', async (c) => {
  const body = await c.req.json();
  const { tenant_id = 'default', party_id, ...fields } = body;

  if (!party_id) return c.json({ error: 'party_id is required' }, 400);

  const existing = await db
    .select()
    .from(cdpServiceSummaries)
    .where(and(eq(cdpServiceSummaries.tenant_id, tenant_id), eq(cdpServiceSummaries.party_id, party_id)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(cdpServiceSummaries)
      .set({ ...fields, updated_at: new Date() })
      .where(eq(cdpServiceSummaries.service_summary_id, existing[0].service_summary_id));
    return c.json({ service_summary_id: existing[0].service_summary_id, action: 'updated' });
  }

  const service_summary_id = crypto.randomUUID();
  await db.insert(cdpServiceSummaries).values({ service_summary_id, tenant_id, party_id, ...fields });
  return c.json({ service_summary_id, action: 'created' }, 201);
});

// ── Interaction Summary ───────────────────────────────────────────────────

/** GET /interaction-summary — 获取 party 的 interaction summary */
router.get('/interaction-summary', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const partyId = c.req.query('party_id');

  if (!partyId) return c.json({ error: 'party_id is required' }, 400);

  const rows = await db
    .select()
    .from(cdpInteractionSummaries)
    .where(and(eq(cdpInteractionSummaries.tenant_id, tenantId), eq(cdpInteractionSummaries.party_id, partyId)))
    .limit(1);

  if (rows.length === 0) return c.json({ error: 'interaction summary not found' }, 404);
  return c.json(rows[0]);
});

/** PUT /interaction-summary — 创建或更新 interaction summary */
router.put('/interaction-summary', async (c) => {
  const body = await c.req.json();
  const { tenant_id = 'default', party_id, ...fields } = body;

  if (!party_id) return c.json({ error: 'party_id is required' }, 400);

  const existing = await db
    .select()
    .from(cdpInteractionSummaries)
    .where(and(eq(cdpInteractionSummaries.tenant_id, tenant_id), eq(cdpInteractionSummaries.party_id, party_id)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(cdpInteractionSummaries)
      .set({ ...fields, updated_at: new Date() })
      .where(eq(cdpInteractionSummaries.interaction_summary_id, existing[0].interaction_summary_id));
    return c.json({ interaction_summary_id: existing[0].interaction_summary_id, action: 'updated' });
  }

  const interaction_summary_id = crypto.randomUUID();
  await db.insert(cdpInteractionSummaries).values({ interaction_summary_id, tenant_id, party_id, ...fields });
  return c.json({ interaction_summary_id, action: 'created' }, 201);
});

export default router;
