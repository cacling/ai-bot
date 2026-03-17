/**
 * change-requests.ts — 高风险变更审批
 *
 * GET  /api/change-requests         — 待审批列表
 * GET  /api/change-requests/:id     — 审批详情（含 diff）
 * POST /api/change-requests/:id/approve — 审批通过
 * POST /api/change-requests/:id/reject  — 驳回
 */

import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../../db';
import { changeRequests } from '../../../db/schema';
import { saveSkillWithVersion } from '../../../compliance/version-manager';
import { requireRole } from '../../../middleware/auth';
import { logger } from '../../../logger';

const changeRequestRoutes = new Hono();

// GET /api/change-requests
changeRequestRoutes.get('/', async (c) => {
  const status = c.req.query('status') ?? 'pending';
  const rows = await db
    .select()
    .from(changeRequests)
    .where(eq(changeRequests.status, status))
    .orderBy(desc(changeRequests.created_at));
  return c.json(rows);
});

// GET /api/change-requests/:id
changeRequestRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const rows = await db
    .select()
    .from(changeRequests)
    .where(eq(changeRequests.id, id))
    .limit(1);
  if (rows.length === 0) {
    return c.json({ error: '变更请求不存在' }, 404);
  }
  return c.json(rows[0]);
});

// POST /api/change-requests/:id/approve
changeRequestRoutes.post('/:id/approve', requireRole('reviewer'), async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const rows = await db
    .select()
    .from(changeRequests)
    .where(eq(changeRequests.id, id))
    .limit(1);
  if (rows.length === 0) {
    return c.json({ error: '变更请求不存在' }, 404);
  }
  const cr = rows[0];
  if (cr.status !== 'pending') {
    return c.json({ error: `变更请求已是 ${cr.status} 状态` }, 400);
  }

  const reviewer = c.req.header('X-User-Id') ?? 'reviewer';

  // Apply the change
  const { versionId } = await saveSkillWithVersion(
    cr.skill_path,
    cr.new_content,
    `审批通过: ${cr.description ?? '高风险变更'}`,
    reviewer as string,
  );

  await db
    .update(changeRequests)
    .set({
      status: 'approved',
      reviewer: reviewer as string,
      reviewed_at: new Date().toISOString(),
    })
    .where(eq(changeRequests.id, id));

  logger.info('change-request', 'approved', { id, reviewer, versionId });
  return c.json({ ok: true, versionId });
});

// POST /api/change-requests/:id/reject
changeRequestRoutes.post('/:id/reject', requireRole('reviewer'), async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const rows = await db
    .select()
    .from(changeRequests)
    .where(eq(changeRequests.id, id))
    .limit(1);
  if (rows.length === 0) {
    return c.json({ error: '变更请求不存在' }, 404);
  }
  const cr = rows[0];
  if (cr.status !== 'pending') {
    return c.json({ error: `变更请求已是 ${cr.status} 状态` }, 400);
  }

  const reviewer = c.req.header('X-User-Id') ?? 'reviewer';

  await db
    .update(changeRequests)
    .set({
      status: 'rejected',
      reviewer: reviewer as string,
      reviewed_at: new Date().toISOString(),
    })
    .where(eq(changeRequests.id, id));

  logger.info('change-request', 'rejected', { id, reviewer });
  return c.json({ ok: true });
});

export default changeRequestRoutes;

/**
 * 高风险检测函数 — 检查内容变更是否涉及高风险模式
 */
export function detectHighRisk(oldContent: string, newContent: string): string | null {
  const riskPatterns = [
    { pattern: /transfer_to_human|转人工|转接/, label: '转人工条件变更' },
    { pattern: /催收|还款|逾期|欠款/, label: '催收话术修改' },
    { pattern: /tool:|工具/, label: '工具权限变更' },
    { pattern: /banned|warning|违规/, label: '合规词库修改' },
  ];
  // Check if the diff involves these patterns
  for (const { pattern, label } of riskPatterns) {
    const oldMatch = pattern.test(oldContent);
    const newMatch = pattern.test(newContent);
    if (oldMatch !== newMatch || (oldMatch && newMatch)) {
      // Content around these patterns changed
      const oldLines = oldContent.split('\n').filter(l => pattern.test(l));
      const newLines = newContent.split('\n').filter(l => pattern.test(l));
      if (JSON.stringify(oldLines) !== JSON.stringify(newLines)) {
        return label;
      }
    }
  }
  return null;
}
