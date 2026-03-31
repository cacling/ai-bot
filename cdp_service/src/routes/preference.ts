/**
 * Communication Preference 路由
 */
import { Hono } from 'hono';
import { db, cdpCommunicationPreferences, eq, and } from '../db';

const router = new Hono();

/** POST / — 创建偏好 */
router.post('/', async (c) => {
  const body = await c.req.json();
  const {
    tenant_id = 'default',
    party_id,
    preference_type,
    channel_type,
    preference_value,
    priority_order,
    source_system = 'api',
  } = body;

  if (!party_id || !preference_type || !preference_value) {
    return c.json({ error: 'party_id, preference_type, preference_value are required' }, 400);
  }

  const communication_preference_id = crypto.randomUUID();

  await db.insert(cdpCommunicationPreferences).values({
    communication_preference_id,
    tenant_id,
    party_id,
    preference_type,
    channel_type: channel_type ?? null,
    preference_value,
    priority_order: priority_order ?? null,
    source_system,
  });

  return c.json({ communication_preference_id }, 201);
});

/** GET / — 查询 party 的所有偏好 */
router.get('/', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const partyId = c.req.query('party_id');

  if (!partyId) {
    return c.json({ error: 'party_id query param is required' }, 400);
  }

  const rows = await db
    .select()
    .from(cdpCommunicationPreferences)
    .where(
      and(
        eq(cdpCommunicationPreferences.tenant_id, tenantId),
        eq(cdpCommunicationPreferences.party_id, partyId),
      ),
    );

  return c.json({ items: rows });
});

/** DELETE /:prefId — 删除偏好 */
router.delete('/:prefId', async (c) => {
  const prefId = c.req.param('prefId');

  await db
    .delete(cdpCommunicationPreferences)
    .where(eq(cdpCommunicationPreferences.communication_preference_id, prefId));

  return c.json({ deleted: true });
});

export default router;
