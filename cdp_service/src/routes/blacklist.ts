/**
 * Blacklist 路由 — 黑名单管理
 */
import { Hono } from 'hono';
import {
  db,
  cdpBlacklist,
  cdpParties,
  cdpPartyIdentities,
  cdpAuditLogs,
  eq,
  and,
  count,
  desc,
} from '../db';

const router = new Hono();

/** GET / — 黑名单列表（分页） */
router.get('/', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const page = Math.max(Number(c.req.query('page') ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(c.req.query('page_size') ?? 20), 1), 100);
  const offset = (page - 1) * pageSize;
  const status = c.req.query('status') ?? 'active';

  const conditions = [
    eq(cdpBlacklist.tenant_id, tenantId),
    eq(cdpBlacklist.status, status),
  ];
  const whereClause = and(...conditions);

  const [totalResult, rows] = await Promise.all([
    db.select({ value: count() }).from(cdpBlacklist).where(whereClause),
    db.select().from(cdpBlacklist)
      .where(whereClause)
      .orderBy(desc(cdpBlacklist.created_at))
      .limit(pageSize)
      .offset(offset),
  ]);

  // Enrich with party display_name and primary phone
  const enriched = await Promise.all(
    rows.map(async (row) => {
      const [partyRows, identityRows] = await Promise.all([
        db.select({ display_name: cdpParties.display_name })
          .from(cdpParties).where(eq(cdpParties.party_id, row.party_id)).limit(1),
        db.select({ identity_value: cdpPartyIdentities.identity_value, identity_type: cdpPartyIdentities.identity_type })
          .from(cdpPartyIdentities)
          .where(and(
            eq(cdpPartyIdentities.party_id, row.party_id),
            eq(cdpPartyIdentities.primary_flag, true),
            eq(cdpPartyIdentities.status, 'active'),
          ))
          .limit(1),
      ]);
      return {
        ...row,
        display_name: partyRows[0]?.display_name ?? null,
        primary_phone: identityRows[0]?.identity_type === 'phone' ? identityRows[0].identity_value : null,
      };
    }),
  );

  return c.json({
    items: enriched,
    total: totalResult[0]?.value ?? 0,
    page,
    page_size: pageSize,
  });
});

/** POST / — 加黑名单 */
router.post('/', async (c) => {
  const body = await c.req.json();
  const { tenant_id = 'default', party_id, reason, source = 'manual' } = body;

  if (!party_id || !reason) {
    return c.json({ error: 'party_id and reason are required' }, 400);
  }

  // Check party exists
  const partyRows = await db.select().from(cdpParties).where(eq(cdpParties.party_id, party_id)).limit(1);
  if (partyRows.length === 0) return c.json({ error: 'party not found' }, 404);

  // Check not already blacklisted
  const existing = await db.select().from(cdpBlacklist).where(
    and(eq(cdpBlacklist.tenant_id, tenant_id), eq(cdpBlacklist.party_id, party_id), eq(cdpBlacklist.status, 'active')),
  ).limit(1);
  if (existing.length > 0) return c.json({ error: 'party already blacklisted' }, 409);

  const blacklist_id = crypto.randomUUID();
  const operatorId = c.req.header('x-staff-id') ?? null;
  const operatorName = c.req.header('x-staff-name') ?? null;

  await db.insert(cdpBlacklist).values({
    blacklist_id,
    tenant_id,
    party_id,
    reason,
    source,
    operator_id: operatorId,
    operator_name: operatorName,
  });

  await db.insert(cdpAuditLogs).values({
    audit_log_id: crypto.randomUUID(),
    tenant_id,
    object_type: 'party',
    object_id: party_id,
    action: 'blacklist',
    operator_id: operatorId,
    operator_name: operatorName,
    after_value: JSON.stringify({ blacklist_id, reason, source }),
  });

  return c.json({ blacklist_id }, 201);
});

/** PATCH /:id/remove — 解除黑名单 */
router.patch('/:id/remove', async (c) => {
  const blacklistId = c.req.param('id');

  const existing = await db.select().from(cdpBlacklist).where(eq(cdpBlacklist.blacklist_id, blacklistId)).limit(1);
  if (existing.length === 0) return c.json({ error: 'blacklist record not found' }, 404);
  if (existing[0].status !== 'active') return c.json({ error: 'record is not active' }, 400);

  const operatorId = c.req.header('x-staff-id') ?? null;
  const operatorName = c.req.header('x-staff-name') ?? null;

  await db.update(cdpBlacklist).set({
    status: 'removed',
    removed_at: new Date(),
    removed_by: operatorName ?? operatorId,
  }).where(eq(cdpBlacklist.blacklist_id, blacklistId));

  await db.insert(cdpAuditLogs).values({
    audit_log_id: crypto.randomUUID(),
    object_type: 'party',
    object_id: existing[0].party_id,
    action: 'update',
    operator_id: operatorId,
    operator_name: operatorName,
    before_value: JSON.stringify({ blacklist_status: 'active' }),
    after_value: JSON.stringify({ blacklist_status: 'removed' }),
  });

  return c.json({ ok: true });
});

export default router;
