/**
 * Customer Event 路由 — append-only 客户事实事件
 */
import { Hono } from 'hono';
import { db, cdpCustomerEvents, cdpHouseholds, eq, and, desc } from '../db';

const router = new Hono();

// ── Customer Events ───────────────────────────────────────────────────────

/** POST /events — 记录客户事件 */
router.post('/events', async (c) => {
  const body = await c.req.json();
  const {
    tenant_id = 'default',
    party_id,
    event_type,
    event_category,
    event_time,
    source_system,
    source_event_id,
    channel_type,
    subscription_id,
    account_id,
    severity,
    event_payload_json,
    identity_refs_json,
  } = body;

  if (!event_type || !event_category || !source_system) {
    return c.json({ error: 'event_type, event_category, source_system are required' }, 400);
  }

  const customer_event_id = crypto.randomUUID();

  await db.insert(cdpCustomerEvents).values({
    customer_event_id,
    tenant_id,
    party_id: party_id ?? null,
    event_type,
    event_category,
    event_time: event_time ? new Date(event_time) : new Date(),
    source_system,
    source_event_id: source_event_id ?? null,
    channel_type: channel_type ?? null,
    subscription_id: subscription_id ?? null,
    account_id: account_id ?? null,
    severity: severity ?? null,
    event_payload_json: event_payload_json ? JSON.stringify(event_payload_json) : null,
    identity_refs_json: identity_refs_json ? JSON.stringify(identity_refs_json) : null,
  });

  return c.json({ customer_event_id }, 201);
});

/** GET /events — 查询 party 的事件时间线 */
router.get('/events', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const partyId = c.req.query('party_id');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);

  if (!partyId) {
    return c.json({ error: 'party_id is required' }, 400);
  }

  const rows = await db
    .select()
    .from(cdpCustomerEvents)
    .where(
      and(
        eq(cdpCustomerEvents.tenant_id, tenantId),
        eq(cdpCustomerEvents.party_id, partyId),
      ),
    )
    .orderBy(desc(cdpCustomerEvents.event_time))
    .limit(limit);

  return c.json({ items: rows });
});

// ── Households ────────────────────────────────────────────────────────────

/** POST /households — 创建 household */
router.post('/households', async (c) => {
  const body = await c.req.json();
  const { tenant_id = 'default', household_name, primary_party_id, address_json } = body;

  const household_id = crypto.randomUUID();

  await db.insert(cdpHouseholds).values({
    household_id,
    tenant_id,
    household_name: household_name ?? null,
    primary_party_id: primary_party_id ?? null,
    address_json: address_json ? JSON.stringify(address_json) : null,
  });

  return c.json({ household_id }, 201);
});

/** GET /households/:householdId — 获取 household */
router.get('/households/:householdId', async (c) => {
  const householdId = c.req.param('householdId');

  const rows = await db
    .select()
    .from(cdpHouseholds)
    .where(eq(cdpHouseholds.household_id, householdId))
    .limit(1);

  if (rows.length === 0) return c.json({ error: 'household not found' }, 404);
  return c.json(rows[0]);
});

export default router;
