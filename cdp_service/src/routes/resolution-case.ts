/**
 * Identity Resolution Case 路由 — merge/split 审核工单
 */
import { Hono } from 'hono';
import { db, cdpIdentityResolutionCases, eq, and } from '../db';

const router = new Hono();

/** POST / — 创建 resolution case */
router.post('/', async (c) => {
  const body = await c.req.json();
  const {
    tenant_id = 'default',
    left_entity_type,
    left_entity_id,
    right_entity_type,
    right_entity_id,
    suggested_action,
    match_score,
    evidence_json,
  } = body;

  if (!left_entity_type || !left_entity_id || !right_entity_type || !right_entity_id || !suggested_action) {
    return c.json({ error: 'left_entity_type, left_entity_id, right_entity_type, right_entity_id, suggested_action are required' }, 400);
  }

  const resolution_case_id = crypto.randomUUID();

  await db.insert(cdpIdentityResolutionCases).values({
    resolution_case_id,
    tenant_id,
    left_entity_type,
    left_entity_id,
    right_entity_type,
    right_entity_id,
    suggested_action,
    match_score: match_score ?? null,
    status: 'open',
    evidence_json: evidence_json ? JSON.stringify(evidence_json) : null,
  });

  return c.json({ resolution_case_id, status: 'open' }, 201);
});

/** GET / — 查询 resolution cases（按状态过滤） */
router.get('/', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const status = c.req.query('status') ?? 'open';

  const rows = await db
    .select()
    .from(cdpIdentityResolutionCases)
    .where(
      and(
        eq(cdpIdentityResolutionCases.tenant_id, tenantId),
        eq(cdpIdentityResolutionCases.status, status),
      ),
    );

  return c.json({ items: rows });
});

/** GET /:caseId — 获取单个 case 详情 */
router.get('/:caseId', async (c) => {
  const caseId = c.req.param('caseId');

  const rows = await db
    .select()
    .from(cdpIdentityResolutionCases)
    .where(eq(cdpIdentityResolutionCases.resolution_case_id, caseId))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: 'case not found' }, 404);
  }

  return c.json(rows[0]);
});

/** PATCH /:caseId — 审批 case（approve / reject / execute / cancel） */
router.patch('/:caseId', async (c) => {
  const caseId = c.req.param('caseId');
  const body = await c.req.json();
  const { status, reviewed_by, review_reason } = body;

  const validStatuses = ['approved', 'rejected', 'executed', 'cancelled'];
  if (!status || !validStatuses.includes(status)) {
    return c.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, 400);
  }

  await db
    .update(cdpIdentityResolutionCases)
    .set({
      status,
      reviewed_by: reviewed_by ?? null,
      review_reason: review_reason ?? null,
      reviewed_at: new Date(),
    })
    .where(eq(cdpIdentityResolutionCases.resolution_case_id, caseId));

  return c.json({ resolution_case_id: caseId, status });
});

export default router;
