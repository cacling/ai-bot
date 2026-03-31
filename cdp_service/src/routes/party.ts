/**
 * Party 路由 — CRUD + context serving
 */
import { Hono } from 'hono';
import {
  db,
  cdpParties,
  cdpPartyIdentities,
  cdpContactPoints,
  cdpServiceSubscriptions,
  cdpCustomerAccounts,
  cdpPartySubscriptionRelations,
  eq,
  and,
} from '../db';
import { normalizeIdentityValue } from './identity';

const router = new Hono();

/** POST / — 创建 party */
router.post('/', async (c) => {
  const body = await c.req.json();
  const {
    tenant_id = 'default',
    party_type = 'customer',
    display_name,
    canonical_name,
    identities = [],
    contact_points = [],
  } = body;

  const party_id = crypto.randomUUID();

  await db.insert(cdpParties).values({
    party_id,
    tenant_id,
    party_type,
    display_name,
    canonical_name,
    status: 'active',
  });

  // 批量插入 identities
  for (const id of identities as Array<{ identity_type: string; identity_value: string; source_system?: string }>) {
    await db.insert(cdpPartyIdentities).values({
      party_identity_id: crypto.randomUUID(),
      tenant_id,
      party_id,
      identity_type: id.identity_type,
      identity_value: id.identity_value,
      identity_value_norm: normalizeIdentityValue(id.identity_type, id.identity_value),
      source_system: id.source_system ?? 'api',
      primary_flag: true,
    });
  }

  // 批量插入 contact_points
  for (const cp of contact_points as Array<{ contact_type: string; contact_value: string; label?: string }>) {
    await db.insert(cdpContactPoints).values({
      contact_point_id: crypto.randomUUID(),
      tenant_id,
      party_id,
      contact_type: cp.contact_type,
      contact_value: cp.contact_value,
      contact_value_norm: normalizeIdentityValue(cp.contact_type, cp.contact_value),
      label: cp.label,
    });
  }

  return c.json({ party_id, tenant_id, party_type, display_name }, 201);
});

/** GET /:partyId — 获取 party 基本信息 */
router.get('/:partyId', async (c) => {
  const partyId = c.req.param('partyId');

  const rows = await db
    .select()
    .from(cdpParties)
    .where(eq(cdpParties.party_id, partyId))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: 'party not found' }, 404);
  }

  return c.json(rows[0]);
});

/** GET /:partyId/context — 完整客户上下文 */
router.get('/:partyId/context', async (c) => {
  const partyId = c.req.param('partyId');

  const [partyRows, identities, contacts, relations] = await Promise.all([
    db.select().from(cdpParties).where(eq(cdpParties.party_id, partyId)).limit(1),
    db.select().from(cdpPartyIdentities).where(
      and(eq(cdpPartyIdentities.party_id, partyId), eq(cdpPartyIdentities.status, 'active')),
    ),
    db.select().from(cdpContactPoints).where(
      and(eq(cdpContactPoints.party_id, partyId), eq(cdpContactPoints.status, 'active')),
    ),
    db
      .select({
        relation_id: cdpPartySubscriptionRelations.relation_id,
        relation_type: cdpPartySubscriptionRelations.relation_type,
        primary_flag: cdpPartySubscriptionRelations.primary_flag,
        status: cdpPartySubscriptionRelations.status,
        subscription_id: cdpServiceSubscriptions.service_subscription_id,
        subscription_no: cdpServiceSubscriptions.subscription_no,
        subscription_type: cdpServiceSubscriptions.subscription_type,
        service_identifier: cdpServiceSubscriptions.service_identifier,
        plan_code: cdpServiceSubscriptions.plan_code,
        service_status: cdpServiceSubscriptions.service_status,
        account_id: cdpCustomerAccounts.customer_account_id,
        account_no: cdpCustomerAccounts.account_no,
        account_type: cdpCustomerAccounts.account_type,
        account_status: cdpCustomerAccounts.account_status,
        billing_status: cdpCustomerAccounts.billing_status,
      })
      .from(cdpPartySubscriptionRelations)
      .innerJoin(
        cdpServiceSubscriptions,
        eq(cdpPartySubscriptionRelations.service_subscription_id, cdpServiceSubscriptions.service_subscription_id),
      )
      .innerJoin(
        cdpCustomerAccounts,
        eq(cdpServiceSubscriptions.customer_account_id, cdpCustomerAccounts.customer_account_id),
      )
      .where(
        and(
          eq(cdpPartySubscriptionRelations.party_id, partyId),
          eq(cdpPartySubscriptionRelations.status, 'active'),
        ),
      ),
  ]);

  if (partyRows.length === 0) {
    return c.json({ error: 'party not found' }, 404);
  }

  return c.json({
    party: partyRows[0],
    identities,
    contact_points: contacts,
    subscriptions: relations,
  });
});

/** GET /:partyId/subscriptions — 订阅列表 */
router.get('/:partyId/subscriptions', async (c) => {
  const partyId = c.req.param('partyId');

  const rows = await db
    .select({
      relation_id: cdpPartySubscriptionRelations.relation_id,
      relation_type: cdpPartySubscriptionRelations.relation_type,
      primary_flag: cdpPartySubscriptionRelations.primary_flag,
      subscription_id: cdpServiceSubscriptions.service_subscription_id,
      subscription_no: cdpServiceSubscriptions.subscription_no,
      subscription_type: cdpServiceSubscriptions.subscription_type,
      service_identifier: cdpServiceSubscriptions.service_identifier,
      plan_code: cdpServiceSubscriptions.plan_code,
      service_status: cdpServiceSubscriptions.service_status,
      snapshot_json: cdpServiceSubscriptions.snapshot_json,
    })
    .from(cdpPartySubscriptionRelations)
    .innerJoin(
      cdpServiceSubscriptions,
      eq(cdpPartySubscriptionRelations.service_subscription_id, cdpServiceSubscriptions.service_subscription_id),
    )
    .where(
      and(
        eq(cdpPartySubscriptionRelations.party_id, partyId),
        eq(cdpPartySubscriptionRelations.status, 'active'),
      ),
    );

  return c.json({ items: rows });
});

/** POST /:partyId/identity — 新增 identity */
router.post('/:partyId/identity', async (c) => {
  const partyId = c.req.param('partyId');
  const body = await c.req.json();
  const { tenant_id = 'default', identity_type, identity_value, source_system = 'api' } = body;

  if (!identity_type || !identity_value) {
    return c.json({ error: 'identity_type and identity_value are required' }, 400);
  }

  // 检查 party 存在
  const partyRows = await db.select().from(cdpParties).where(eq(cdpParties.party_id, partyId)).limit(1);
  if (partyRows.length === 0) {
    return c.json({ error: 'party not found' }, 404);
  }

  const norm = normalizeIdentityValue(identity_type, identity_value);
  const party_identity_id = crypto.randomUUID();

  try {
    await db.insert(cdpPartyIdentities).values({
      party_identity_id,
      tenant_id,
      party_id: partyId,
      identity_type,
      identity_value,
      identity_value_norm: norm,
      source_system,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
      return c.json({ error: 'identity already exists', identity_type, identity_value_norm: norm }, 409);
    }
    throw err;
  }

  return c.json({ party_identity_id, party_id: partyId, identity_type, identity_value_norm: norm }, 201);
});

export default router;
