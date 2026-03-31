/**
 * Consent Record 路由 — 客户同意/授权管理
 */
import { Hono } from 'hono';
import { db, cdpConsentRecords, eq, and } from '../db';

const router = new Hono();

/** POST / — 创建 consent record */
router.post('/', async (c) => {
  const body = await c.req.json();
  const {
    tenant_id = 'default',
    party_id,
    contact_point_id,
    channel_type,
    purpose_type,
    consent_status = 'granted',
    jurisdiction,
    evidence_ref,
    source_system = 'api',
  } = body;

  if (!party_id || !channel_type || !purpose_type) {
    return c.json({ error: 'party_id, channel_type, purpose_type are required' }, 400);
  }

  const consent_record_id = crypto.randomUUID();

  await db.insert(cdpConsentRecords).values({
    consent_record_id,
    tenant_id,
    party_id,
    contact_point_id: contact_point_id ?? null,
    channel_type,
    purpose_type,
    consent_status,
    jurisdiction: jurisdiction ?? null,
    evidence_ref: evidence_ref ?? null,
    source_system,
  });

  return c.json({ consent_record_id, consent_status }, 201);
});

/** GET / — 查询 party 的 consent records */
router.get('/', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const partyId = c.req.query('party_id');

  if (!partyId) {
    return c.json({ error: 'party_id query param is required' }, 400);
  }

  const rows = await db
    .select()
    .from(cdpConsentRecords)
    .where(
      and(
        eq(cdpConsentRecords.tenant_id, tenantId),
        eq(cdpConsentRecords.party_id, partyId),
      ),
    );

  return c.json({ items: rows });
});

/**
 * GET /check — CheckConsentAndContactability
 * 查询 party 在某个渠道+用途下是否有有效 consent
 */
router.get('/check', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const partyId = c.req.query('party_id');
  const channelType = c.req.query('channel_type');
  const purposeType = c.req.query('purpose_type');

  if (!partyId || !channelType || !purposeType) {
    return c.json({ error: 'party_id, channel_type, purpose_type are required' }, 400);
  }

  const rows = await db
    .select()
    .from(cdpConsentRecords)
    .where(
      and(
        eq(cdpConsentRecords.tenant_id, tenantId),
        eq(cdpConsentRecords.party_id, partyId),
        eq(cdpConsentRecords.channel_type, channelType),
        eq(cdpConsentRecords.purpose_type, purposeType),
        eq(cdpConsentRecords.consent_status, 'granted'),
      ),
    )
    .limit(1);

  const contactable = rows.length > 0;
  return c.json({
    contactable,
    party_id: partyId,
    channel_type: channelType,
    purpose_type: purposeType,
    consent: contactable ? rows[0] : null,
  });
});

/** PATCH /:consentId — 更新 consent 状态（revoke / expire） */
router.patch('/:consentId', async (c) => {
  const consentId = c.req.param('consentId');
  const body = await c.req.json();
  const { consent_status } = body;

  const validStatuses = ['granted', 'revoked', 'expired', 'pending'];
  if (!consent_status || !validStatuses.includes(consent_status)) {
    return c.json({ error: `consent_status must be one of: ${validStatuses.join(', ')}` }, 400);
  }

  await db
    .update(cdpConsentRecords)
    .set({ consent_status, updated_at: new Date() })
    .where(eq(cdpConsentRecords.consent_record_id, consentId));

  return c.json({ consent_record_id: consentId, consent_status });
});

export default router;
