/**
 * Customer 路由 — 客户列表 + 详情聚合 + 编辑
 */
import { Hono } from 'hono';
import {
  db,
  cdpParties,
  cdpPartyIdentities,
  cdpContactPoints,
  cdpCustomerProfiles,
  cdpCustomerEvents,
  cdpConsentRecords,
  cdpAuditLogs,
  eq,
  and,
  like,
  or,
  desc,
  count,
  sql,
} from '../db';

const router = new Hono();

/** GET / — 客户列表（分页 + 筛选） */
router.get('/', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const page = Math.max(Number(c.req.query('page') ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(c.req.query('page_size') ?? 20), 1), 100);
  const offset = (page - 1) * pageSize;

  const keyword = c.req.query('keyword')?.trim();
  const status = c.req.query('status');
  const partyType = c.req.query('party_type');

  // Build conditions
  const conditions = [
    eq(cdpParties.tenant_id, tenantId),
  ];

  if (status) {
    conditions.push(eq(cdpParties.status, status));
  }
  if (partyType) {
    conditions.push(eq(cdpParties.party_type, partyType));
  }

  const whereClause = and(...conditions);

  // If keyword provided, we need to join with identities for phone search
  if (keyword) {
    // Search by display_name or identity_value (phone/email)
    const matchedPartyIds = await db
      .selectDistinct({ party_id: cdpPartyIdentities.party_id })
      .from(cdpPartyIdentities)
      .where(
        and(
          eq(cdpPartyIdentities.tenant_id, tenantId),
          like(cdpPartyIdentities.identity_value_norm, `%${keyword.replace(/[%_]/g, '')}%`),
        ),
      )
      .limit(500);

    const idSet = new Set(matchedPartyIds.map((r) => r.party_id));

    // Also match by display_name
    const nameMatched = await db
      .select({ party_id: cdpParties.party_id })
      .from(cdpParties)
      .where(
        and(
          whereClause!,
          like(cdpParties.display_name, `%${keyword}%`),
        ),
      )
      .limit(500);

    for (const r of nameMatched) idSet.add(r.party_id);

    const allIds = [...idSet];
    const total = allIds.length;
    const pagedIds = allIds.slice(offset, offset + pageSize);

    if (pagedIds.length === 0) {
      return c.json({ items: [], total, page, page_size: pageSize });
    }

    const rows = await db
      .select()
      .from(cdpParties)
      .where(sql`${cdpParties.party_id} IN (${sql.join(pagedIds.map((id) => sql`${id}`), sql`, `)})`)
      .orderBy(desc(cdpParties.updated_at));

    // Enrich with primary identity
    const enriched = await enrichPartyList(rows, tenantId);
    return c.json({ items: enriched, total, page, page_size: pageSize });
  }

  // No keyword — standard paginated query
  const [totalResult, rows] = await Promise.all([
    db.select({ value: count() }).from(cdpParties).where(whereClause),
    db.select().from(cdpParties)
      .where(whereClause)
      .orderBy(desc(cdpParties.updated_at))
      .limit(pageSize)
      .offset(offset),
  ]);

  const total = totalResult[0]?.value ?? 0;
  const enriched = await enrichPartyList(rows, tenantId);

  return c.json({ items: enriched, total, page, page_size: pageSize });
});

/** GET /:partyId — 客户详情聚合（360 画像） */
router.get('/:partyId', async (c) => {
  const partyId = c.req.param('partyId');
  const tenantId = c.req.query('tenant_id') ?? 'default';

  const [partyRows, identities, contacts, profileRows, recentEvents, consents] = await Promise.all([
    db.select().from(cdpParties).where(eq(cdpParties.party_id, partyId)).limit(1),
    db.select().from(cdpPartyIdentities).where(
      and(eq(cdpPartyIdentities.party_id, partyId), eq(cdpPartyIdentities.status, 'active')),
    ),
    db.select().from(cdpContactPoints).where(
      and(eq(cdpContactPoints.party_id, partyId), eq(cdpContactPoints.status, 'active')),
    ),
    db.select().from(cdpCustomerProfiles).where(eq(cdpCustomerProfiles.party_id, partyId)).limit(1),
    db.select().from(cdpCustomerEvents).where(
      and(eq(cdpCustomerEvents.tenant_id, tenantId), eq(cdpCustomerEvents.party_id, partyId)),
    ).orderBy(desc(cdpCustomerEvents.event_time)).limit(20),
    db.select().from(cdpConsentRecords).where(
      and(eq(cdpConsentRecords.tenant_id, tenantId), eq(cdpConsentRecords.party_id, partyId)),
    ),
  ]);

  if (partyRows.length === 0) {
    return c.json({ error: 'customer not found' }, 404);
  }

  return c.json({
    party: partyRows[0],
    identities,
    contact_points: contacts,
    profile: profileRows[0] ?? null,
    recent_events: recentEvents,
    consents,
  });
});

/** PATCH /:partyId — 编辑客户基础信息 */
router.patch('/:partyId', async (c) => {
  const partyId = c.req.param('partyId');
  const body = await c.req.json();
  const { display_name, canonical_name, status } = body;

  const existing = await db.select().from(cdpParties).where(eq(cdpParties.party_id, partyId)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: 'customer not found' }, 404);
  }

  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (display_name !== undefined) updates.display_name = display_name;
  if (canonical_name !== undefined) updates.canonical_name = canonical_name;
  if (status !== undefined) updates.status = status;

  await db.update(cdpParties).set(updates).where(eq(cdpParties.party_id, partyId));

  // Write audit log
  const operatorId = c.req.header('x-staff-id') ?? null;
  const operatorName = c.req.header('x-staff-name') ?? null;
  await db.insert(cdpAuditLogs).values({
    audit_log_id: crypto.randomUUID(),
    object_type: 'party',
    object_id: partyId,
    action: 'update',
    operator_id: operatorId,
    operator_name: operatorName,
    before_value: JSON.stringify(existing[0]),
    after_value: JSON.stringify({ ...existing[0], ...updates }),
  });

  return c.json({ ok: true });
});

// ── Helpers ──

async function enrichPartyList(
  parties: Array<typeof cdpParties.$inferSelect>,
  tenantId: string,
) {
  if (parties.length === 0) return [];

  const partyIds = parties.map((p) => p.party_id);

  // Fetch primary identities (phone) for each party
  const identities = await db
    .select()
    .from(cdpPartyIdentities)
    .where(
      and(
        eq(cdpPartyIdentities.tenant_id, tenantId),
        eq(cdpPartyIdentities.status, 'active'),
        eq(cdpPartyIdentities.primary_flag, true),
        sql`${cdpPartyIdentities.party_id} IN (${sql.join(partyIds.map((id) => sql`${id}`), sql`, `)})`,
      ),
    );

  const identityMap = new Map<string, typeof cdpPartyIdentities.$inferSelect>();
  for (const id of identities) {
    if (!identityMap.has(id.party_id)) {
      identityMap.set(id.party_id, id);
    }
  }

  // Fetch profiles
  const profiles = await db
    .select()
    .from(cdpCustomerProfiles)
    .where(
      sql`${cdpCustomerProfiles.party_id} IN (${sql.join(partyIds.map((id) => sql`${id}`), sql`, `)})`,
    );

  const profileMap = new Map<string, typeof cdpCustomerProfiles.$inferSelect>();
  for (const p of profiles) {
    profileMap.set(p.party_id, p);
  }

  return parties.map((party) => ({
    ...party,
    primary_identity: identityMap.get(party.party_id) ?? null,
    profile: profileMap.get(party.party_id) ?? null,
  }));
}

export default router;
