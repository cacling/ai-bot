/**
 * evidence.ts — 证据引用 CRUD + 校验
 */
import { Hono } from 'hono';
import { eq, and, SQL } from 'drizzle-orm';
import { db } from '../../db';
import { kmEvidenceRefs } from '../../db/schema';
import { nanoid, writeAudit } from './helpers';

const app = new Hono();

// GET / — 证据列表（按候选或资产过滤）
app.get('/', async (c) => {
  const { candidate_id, asset_id, status } = c.req.query();
  const conditions: SQL[] = [];
  if (candidate_id) conditions.push(eq(kmEvidenceRefs.candidate_id, candidate_id));
  if (asset_id) conditions.push(eq(kmEvidenceRefs.asset_id, asset_id));
  if (status) conditions.push(eq(kmEvidenceRefs.status, status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(kmEvidenceRefs).where(where);
  return c.json({ items: rows });
});

// POST / — 创建证据引用
app.post('/', async (c) => {
  const body = await c.req.json<{
    candidate_id?: string; asset_id?: string; doc_version_id?: string;
    locator?: string; rule_version?: string;
  }>();
  const id = nanoid();
  await db.insert(kmEvidenceRefs).values({
    id, candidate_id: body.candidate_id, asset_id: body.asset_id,
    doc_version_id: body.doc_version_id, locator: body.locator,
    rule_version: body.rule_version, status: 'pending',
    created_at: new Date().toISOString(),
  });
  return c.json({ id }, 201);
});

// PUT /:id — 更新证据（审核通过/失败）
app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    status: string; fail_reason?: string; reviewed_by?: string;
  }>();
  await db.update(kmEvidenceRefs).set({
    status: body.status, fail_reason: body.fail_reason,
    reviewed_by: body.reviewed_by, reviewed_at: new Date().toISOString(),
  }).where(eq(kmEvidenceRefs.id, id));

  if (body.status === 'pass' || body.status === 'fail') {
    await writeAudit({
      action: `evidence_${body.status}`, object_type: 'evidence_ref', object_id: id,
      operator: body.reviewed_by, detail: { fail_reason: body.fail_reason },
    });
  }
  return c.json({ ok: true });
});

export default app;
