/**
 * Tag 路由 — 标签管理 + 批量打标/移除
 */
import { Hono } from 'hono';
import {
  db,
  cdpTags,
  cdpPartyTags,
  cdpAuditLogs,
  eq,
  and,
  like,
  count,
  desc,
  sql,
} from '../db';

const router = new Hono();

/** GET / — 标签列表（分页 + 分类筛选） */
router.get('/', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const page = Math.max(Number(c.req.query('page') ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(c.req.query('page_size') ?? 50), 1), 200);
  const offset = (page - 1) * pageSize;

  const category = c.req.query('category');
  const tagType = c.req.query('tag_type');
  const status = c.req.query('status');
  const keyword = c.req.query('keyword')?.trim();

  const conditions = [eq(cdpTags.tenant_id, tenantId)];
  if (category) conditions.push(eq(cdpTags.tag_category, category));
  if (tagType) conditions.push(eq(cdpTags.tag_type, tagType));
  if (status) conditions.push(eq(cdpTags.status, status));
  if (keyword) conditions.push(like(cdpTags.tag_name, `%${keyword}%`));

  const whereClause = and(...conditions);

  const [totalResult, rows] = await Promise.all([
    db.select({ value: count() }).from(cdpTags).where(whereClause),
    db.select().from(cdpTags)
      .where(whereClause)
      .orderBy(desc(cdpTags.updated_at))
      .limit(pageSize)
      .offset(offset),
  ]);

  return c.json({
    items: rows,
    total: totalResult[0]?.value ?? 0,
    page,
    page_size: pageSize,
  });
});

/** POST / — 创建标签 */
router.post('/', async (c) => {
  const body = await c.req.json();
  const {
    tenant_id = 'default',
    tag_name,
    tag_category,
    tag_type = 'manual',
    description,
    rule_config,
  } = body;

  if (!tag_name) return c.json({ error: 'tag_name is required' }, 400);

  const tag_id = crypto.randomUUID();

  try {
    await db.insert(cdpTags).values({
      tag_id,
      tenant_id,
      tag_name,
      tag_category: tag_category ?? null,
      tag_type,
      description: description ?? null,
      rule_config: rule_config ? JSON.stringify(rule_config) : null,
      created_by: c.req.header('x-staff-id') ?? null,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
      return c.json({ error: 'tag_name already exists' }, 409);
    }
    throw err;
  }

  // Audit
  await db.insert(cdpAuditLogs).values({
    audit_log_id: crypto.randomUUID(),
    tenant_id,
    object_type: 'tag',
    object_id: tag_id,
    action: 'create',
    operator_id: c.req.header('x-staff-id') ?? null,
    operator_name: c.req.header('x-staff-name') ?? null,
    after_value: JSON.stringify({ tag_name, tag_category, tag_type }),
  });

  return c.json({ tag_id, tag_name }, 201);
});

/** PATCH /:tagId — 编辑标签（含启停） */
router.patch('/:tagId', async (c) => {
  const tagId = c.req.param('tagId');
  const body = await c.req.json();

  const existing = await db.select().from(cdpTags).where(eq(cdpTags.tag_id, tagId)).limit(1);
  if (existing.length === 0) return c.json({ error: 'tag not found' }, 404);

  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (body.tag_name !== undefined) updates.tag_name = body.tag_name;
  if (body.tag_category !== undefined) updates.tag_category = body.tag_category;
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) updates.status = body.status;
  if (body.rule_config !== undefined) updates.rule_config = JSON.stringify(body.rule_config);

  await db.update(cdpTags).set(updates).where(eq(cdpTags.tag_id, tagId));

  await db.insert(cdpAuditLogs).values({
    audit_log_id: crypto.randomUUID(),
    object_type: 'tag',
    object_id: tagId,
    action: 'update',
    operator_id: c.req.header('x-staff-id') ?? null,
    operator_name: c.req.header('x-staff-name') ?? null,
    before_value: JSON.stringify(existing[0]),
    after_value: JSON.stringify({ ...existing[0], ...updates }),
  });

  return c.json({ ok: true });
});

/** DELETE /:tagId — 删除标签 */
router.delete('/:tagId', async (c) => {
  const tagId = c.req.param('tagId');

  const existing = await db.select().from(cdpTags).where(eq(cdpTags.tag_id, tagId)).limit(1);
  if (existing.length === 0) return c.json({ error: 'tag not found' }, 404);

  // Remove all party-tag relations
  await db.delete(cdpPartyTags).where(eq(cdpPartyTags.tag_id, tagId));
  await db.delete(cdpTags).where(eq(cdpTags.tag_id, tagId));

  await db.insert(cdpAuditLogs).values({
    audit_log_id: crypto.randomUUID(),
    object_type: 'tag',
    object_id: tagId,
    action: 'delete',
    operator_id: c.req.header('x-staff-id') ?? null,
    operator_name: c.req.header('x-staff-name') ?? null,
    before_value: JSON.stringify(existing[0]),
  });

  return c.json({ ok: true });
});

/** POST /batch-assign — 批量打标签 */
router.post('/batch-assign', async (c) => {
  const body = await c.req.json();
  const { tenant_id = 'default', party_ids, tag_id, tag_value, source = 'manual' } = body;

  if (!Array.isArray(party_ids) || party_ids.length === 0 || !tag_id) {
    return c.json({ error: 'party_ids (array) and tag_id are required' }, 400);
  }

  // Verify tag exists
  const tagRows = await db.select().from(cdpTags).where(eq(cdpTags.tag_id, tag_id)).limit(1);
  if (tagRows.length === 0) return c.json({ error: 'tag not found' }, 404);

  let assigned = 0;
  for (const partyId of party_ids as string[]) {
    try {
      await db.insert(cdpPartyTags).values({
        party_tag_id: crypto.randomUUID(),
        tenant_id,
        party_id: partyId,
        tag_id,
        tag_value: tag_value ?? null,
        source,
      }).onConflictDoNothing();
      assigned++;
    } catch {
      // skip individual failures
    }
  }

  // Update cover count
  const coverResult = await db
    .select({ value: count() })
    .from(cdpPartyTags)
    .where(and(eq(cdpPartyTags.tenant_id, tenant_id), eq(cdpPartyTags.tag_id, tag_id)));
  await db.update(cdpTags)
    .set({ cover_count: coverResult[0]?.value ?? 0, updated_at: new Date() })
    .where(eq(cdpTags.tag_id, tag_id));

  return c.json({ assigned, total_requested: party_ids.length });
});

/** DELETE /batch-remove — 批量移除标签 */
router.delete('/batch-remove', async (c) => {
  const body = await c.req.json();
  const { tenant_id = 'default', party_ids, tag_id } = body;

  if (!Array.isArray(party_ids) || party_ids.length === 0 || !tag_id) {
    return c.json({ error: 'party_ids (array) and tag_id are required' }, 400);
  }

  let removed = 0;
  for (const partyId of party_ids as string[]) {
    const result = await db.delete(cdpPartyTags).where(
      and(
        eq(cdpPartyTags.tenant_id, tenant_id),
        eq(cdpPartyTags.party_id, partyId),
        eq(cdpPartyTags.tag_id, tag_id),
      ),
    );
    if (result.changes > 0) removed++;
  }

  // Update cover count
  const coverResult = await db
    .select({ value: count() })
    .from(cdpPartyTags)
    .where(and(eq(cdpPartyTags.tenant_id, tenant_id), eq(cdpPartyTags.tag_id, tag_id)));
  await db.update(cdpTags)
    .set({ cover_count: coverResult[0]?.value ?? 0, updated_at: new Date() })
    .where(eq(cdpTags.tag_id, tag_id));

  return c.json({ removed, total_requested: party_ids.length });
});

/** GET /:tagId/parties — 查看标签命中的客户 */
router.get('/:tagId/parties', async (c) => {
  const tagId = c.req.param('tagId');
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);

  const rows = await db
    .select({
      party_tag_id: cdpPartyTags.party_tag_id,
      party_id: cdpPartyTags.party_id,
      tag_value: cdpPartyTags.tag_value,
      source: cdpPartyTags.source,
      created_at: cdpPartyTags.created_at,
    })
    .from(cdpPartyTags)
    .where(and(eq(cdpPartyTags.tenant_id, tenantId), eq(cdpPartyTags.tag_id, tagId)))
    .limit(limit);

  return c.json({ items: rows });
});

export default router;
