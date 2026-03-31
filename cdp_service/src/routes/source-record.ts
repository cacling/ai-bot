/**
 * Source Record Link 路由 — CDP 实体与源系统记录的映射管理
 */
import { Hono } from 'hono';
import { db, cdpSourceRecordLinks, eq, and } from '../db';

const router = new Hono();

/** POST / — 创建 source record link */
router.post('/', async (c) => {
  const body = await c.req.json();
  const {
    tenant_id = 'default',
    source_system,
    source_entity_type,
    source_entity_id,
    target_entity_type,
    target_entity_id,
    link_type = 'imported',
  } = body;

  if (!source_system || !source_entity_type || !source_entity_id || !target_entity_type || !target_entity_id) {
    return c.json({ error: 'source_system, source_entity_type, source_entity_id, target_entity_type, target_entity_id are required' }, 400);
  }

  const source_record_link_id = crypto.randomUUID();

  try {
    await db.insert(cdpSourceRecordLinks).values({
      source_record_link_id,
      tenant_id,
      source_system,
      source_entity_type,
      source_entity_id,
      target_entity_type,
      target_entity_id,
      link_type,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
      return c.json({ error: 'source record link already exists' }, 409);
    }
    throw err;
  }

  return c.json({ source_record_link_id }, 201);
});

/** GET /by-target — 查询某个 CDP 实体的所有源系统映射 */
router.get('/by-target', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const targetType = c.req.query('target_entity_type');
  const targetId = c.req.query('target_entity_id');

  if (!targetType || !targetId) {
    return c.json({ error: 'target_entity_type and target_entity_id are required' }, 400);
  }

  const rows = await db
    .select()
    .from(cdpSourceRecordLinks)
    .where(
      and(
        eq(cdpSourceRecordLinks.tenant_id, tenantId),
        eq(cdpSourceRecordLinks.target_entity_type, targetType),
        eq(cdpSourceRecordLinks.target_entity_id, targetId),
        eq(cdpSourceRecordLinks.active_flag, true),
      ),
    );

  return c.json({ items: rows });
});

/** GET /by-source — 查询某个源系统记录映射到哪个 CDP 实体 */
router.get('/by-source', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const sourceSystem = c.req.query('source_system');
  const sourceType = c.req.query('source_entity_type');
  const sourceId = c.req.query('source_entity_id');

  if (!sourceSystem || !sourceType || !sourceId) {
    return c.json({ error: 'source_system, source_entity_type, source_entity_id are required' }, 400);
  }

  const rows = await db
    .select()
    .from(cdpSourceRecordLinks)
    .where(
      and(
        eq(cdpSourceRecordLinks.tenant_id, tenantId),
        eq(cdpSourceRecordLinks.source_system, sourceSystem),
        eq(cdpSourceRecordLinks.source_entity_type, sourceType),
        eq(cdpSourceRecordLinks.source_entity_id, sourceId),
        eq(cdpSourceRecordLinks.active_flag, true),
      ),
    );

  return c.json({ items: rows });
});

export default router;
