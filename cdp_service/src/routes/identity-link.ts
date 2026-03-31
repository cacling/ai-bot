/**
 * Identity Link 路由 — identity 间关联管理
 */
import { Hono } from 'hono';
import { db, cdpIdentityLinks, cdpPartyIdentities, eq, and } from '../db';

const router = new Hono();

/** POST / — 创建 identity link */
router.post('/', async (c) => {
  const body = await c.req.json();
  const {
    tenant_id = 'default',
    left_party_identity_id,
    right_party_identity_id,
    link_type,
    match_method,
    match_score,
    evidence_json,
  } = body;

  if (!left_party_identity_id || !right_party_identity_id || !link_type || !match_method) {
    return c.json({ error: 'left_party_identity_id, right_party_identity_id, link_type, match_method are required' }, 400);
  }

  const identity_link_id = crypto.randomUUID();

  await db.insert(cdpIdentityLinks).values({
    identity_link_id,
    tenant_id,
    left_party_identity_id,
    right_party_identity_id,
    link_type,
    match_method,
    match_score: match_score ?? null,
    link_status: 'proposed',
    evidence_json: evidence_json ? JSON.stringify(evidence_json) : null,
  });

  return c.json({ identity_link_id, link_status: 'proposed' }, 201);
});

/** GET / — 查询某个 identity 的所有 links */
router.get('/', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const partyIdentityId = c.req.query('party_identity_id');

  if (!partyIdentityId) {
    return c.json({ error: 'party_identity_id query param is required' }, 400);
  }

  const rows = await db
    .select()
    .from(cdpIdentityLinks)
    .where(
      and(
        eq(cdpIdentityLinks.tenant_id, tenantId),
        eq(cdpIdentityLinks.left_party_identity_id, partyIdentityId),
      ),
    );

  // 也查 right side
  const rightRows = await db
    .select()
    .from(cdpIdentityLinks)
    .where(
      and(
        eq(cdpIdentityLinks.tenant_id, tenantId),
        eq(cdpIdentityLinks.right_party_identity_id, partyIdentityId),
      ),
    );

  return c.json({ items: [...rows, ...rightRows] });
});

/** PATCH /:linkId — 审批 identity link（confirm / reject） */
router.patch('/:linkId', async (c) => {
  const linkId = c.req.param('linkId');
  const body = await c.req.json();
  const { link_status, approved_by } = body;

  if (!link_status || !['confirmed', 'rejected', 'expired'].includes(link_status)) {
    return c.json({ error: 'link_status must be one of: confirmed, rejected, expired' }, 400);
  }

  await db
    .update(cdpIdentityLinks)
    .set({
      link_status,
      approved_by: approved_by ?? null,
      approved_at: new Date(),
    })
    .where(eq(cdpIdentityLinks.identity_link_id, linkId));

  return c.json({ identity_link_id: linkId, link_status });
});

export default router;
