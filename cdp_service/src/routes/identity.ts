/**
 * Identity 路由 — identity resolve
 */
import { Hono } from 'hono';
import { db, cdpPartyIdentities, cdpParties, eq, and } from '../db';

const router = new Hono();

/** 规范化 identity 值 */
export function normalizeIdentityValue(type: string, value: string): string {
  switch (type) {
    case 'phone':
      return value.replace(/\D/g, '');
    case 'email':
      return value.trim().toLowerCase();
    default:
      return value.trim();
  }
}

/**
 * POST /resolve
 * Body: { tenant_id, identity_type, identity_value }
 * 返回匹配的 party 信息或 resolved: false
 */
router.post('/resolve', async (c) => {
  const body = await c.req.json();
  const { tenant_id = 'default', identity_type, identity_value } = body;

  if (!identity_type || !identity_value) {
    return c.json({ error: 'identity_type and identity_value are required' }, 400);
  }

  const norm = normalizeIdentityValue(identity_type, identity_value);

  const rows = await db
    .select({
      party_identity_id: cdpPartyIdentities.party_identity_id,
      party_id: cdpPartyIdentities.party_id,
      identity_type: cdpPartyIdentities.identity_type,
      identity_value: cdpPartyIdentities.identity_value,
      status: cdpPartyIdentities.status,
      party_type: cdpParties.party_type,
      display_name: cdpParties.display_name,
      party_status: cdpParties.status,
    })
    .from(cdpPartyIdentities)
    .innerJoin(cdpParties, eq(cdpPartyIdentities.party_id, cdpParties.party_id))
    .where(
      and(
        eq(cdpPartyIdentities.tenant_id, tenant_id),
        eq(cdpPartyIdentities.identity_type, identity_type),
        eq(cdpPartyIdentities.identity_value_norm, norm),
        eq(cdpPartyIdentities.status, 'active'),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    return c.json({ resolved: false, identity_type, identity_value_norm: norm });
  }

  return c.json({ resolved: true, ...rows[0] });
});

export default router;
