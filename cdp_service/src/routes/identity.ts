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

/**
 * POST /resolve-phone
 * Body: { identity_type, identity_value, tenant_id? }
 *
 * Resolves any channel identity (feishu_open_id, wa_id, etc.) to the customer's
 * phone number. Returns the primary phone identity of the same party.
 *
 * Used by channel-host inbound-bridge to convert channel-specific sender IDs
 * to phone numbers before calling the Agent.
 */
router.post('/resolve-phone', async (c) => {
  const body = await c.req.json();
  const { tenant_id = 'default', identity_type, identity_value } = body;

  if (!identity_type || !identity_value) {
    return c.json({ error: 'identity_type and identity_value are required' }, 400);
  }

  const norm = normalizeIdentityValue(identity_type, identity_value);

  // Step 1: find party_id from the channel identity
  const identityRows = await db
    .select({ party_id: cdpPartyIdentities.party_id })
    .from(cdpPartyIdentities)
    .where(
      and(
        eq(cdpPartyIdentities.tenant_id, tenant_id),
        eq(cdpPartyIdentities.identity_type, identity_type),
        eq(cdpPartyIdentities.identity_value_norm, norm),
        eq(cdpPartyIdentities.status, 'active'),
      ),
    )
    .limit(1);

  if (identityRows.length === 0) {
    return c.json({ resolved: false, identity_type, identity_value_norm: norm });
  }

  const partyId = identityRows[0].party_id;

  // Step 2: find the primary phone identity of this party
  const phoneRows = await db
    .select({
      identity_value: cdpPartyIdentities.identity_value,
      display_name: cdpParties.display_name,
    })
    .from(cdpPartyIdentities)
    .innerJoin(cdpParties, eq(cdpPartyIdentities.party_id, cdpParties.party_id))
    .where(
      and(
        eq(cdpPartyIdentities.tenant_id, tenant_id),
        eq(cdpPartyIdentities.party_id, partyId),
        eq(cdpPartyIdentities.identity_type, 'phone'),
        eq(cdpPartyIdentities.status, 'active'),
      ),
    )
    .limit(1);

  if (phoneRows.length === 0) {
    return c.json({ resolved: false, party_id: partyId, error: 'no phone identity found' });
  }

  return c.json({
    resolved: true,
    phone: phoneRows[0].identity_value,
    display_name: phoneRows[0].display_name,
    party_id: partyId,
  });
});

export default router;
