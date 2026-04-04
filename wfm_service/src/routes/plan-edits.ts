/**
 * plan-edits.ts — 排班编辑 API（preview/commit/块操作/校验/历史）
 */
import { Hono } from 'hono';
import {
  db, eq, and,
  wfmScheduleBlocks,
  wfmChangeOperations, wfmChangeItems, wfmActivities,
} from '../db';
import { executeEdit, type EditIntentCommand } from '../services/edit-service';
import { validatePlanDay } from '../services/validator';

const router = new Hono();

// ── Preview 编辑 ──
router.post('/:id/changes/preview', async (c) => {
  const planId = Number(c.req.param('id'));
  const body = await c.req.json();
  const cmd: EditIntentCommand = { ...body, planId, saveMode: 'preview' };
  const result = executeEdit(cmd);
  return c.json(result);
});

// ── Commit 编辑 ──
router.post('/:id/changes/commit', async (c) => {
  const planId = Number(c.req.param('id'));
  const body = await c.req.json();
  const cmd: EditIntentCommand = { ...body, planId, saveMode: 'commit' };
  const result = executeEdit(cmd);
  return c.json(result, result.status === 'rejected' ? 400 : 200);
});

// ── 确认 warnings 后强制提交 ──
router.post('/:id/changes/:opId/confirm', async (c) => {
  const planId = Number(c.req.param('id'));
  const body = await c.req.json();
  const cmd: EditIntentCommand = { ...body, planId, saveMode: 'commit', confirmWarnings: true };
  const result = executeEdit(cmd);
  return c.json(result, result.status === 'rejected' ? 400 : 200);
});

// ── 批量编辑 ──
router.post('/:id/changes/batch', async (c) => {
  const planId = Number(c.req.param('id'));
  const body = await c.req.json();
  const { edits } = body as { edits: Omit<EditIntentCommand, 'planId' | 'saveMode'>[] };
  if (!edits?.length) return c.json({ error: 'edits 数组不能为空' }, 400);

  const results = edits.map(edit => {
    const cmd: EditIntentCommand = { ...edit, planId, saveMode: 'commit' } as EditIntentCommand;
    return executeEdit(cmd);
  });

  return c.json({ results });
});

// ── 编辑历史 ──
router.get('/:id/changes', async (c) => {
  const planId = Number(c.req.param('id'));
  const operations = db.select().from(wfmChangeOperations)
    .where(eq(wfmChangeOperations.planId, planId)).all();

  const result = operations.map(op => {
    const items = db.select().from(wfmChangeItems)
      .where(eq(wfmChangeItems.operationId, op.id)).all();
    return { ...op, items };
  });

  return c.json({ items: result });
});

// ── 块 CRUD（简化接口）──

router.post('/:id/blocks', async (c) => {
  const planId = Number(c.req.param('id'));
  const body = await c.req.json();
  if (!body.entryId || !body.activityId || !body.startTime || !body.endTime) {
    return c.json({ error: 'entryId, activityId, startTime, endTime 不能为空' }, 400);
  }
  if (body.versionNo == null) {
    return c.json({ error: 'versionNo 不能为空（乐观锁）' }, 400);
  }

  const result = executeEdit({
    intentType: 'INSERT_ACTIVITY',
    planId,
    entryId: body.entryId,
    activityId: body.activityId,
    targetRange: { startTime: body.startTime, endTime: body.endTime },
    saveMode: 'commit',
    versionNo: body.versionNo,
  });

  return c.json(result, result.status === 'rejected' ? 400 : 201);
});

router.put('/:id/blocks/:blockId', async (c) => {
  const planId = Number(c.req.param('id'));
  const blockId = Number(c.req.param('blockId'));
  const body = await c.req.json();

  if (body.versionNo == null) {
    return c.json({ error: 'versionNo 不能为空（乐观锁）' }, 400);
  }

  // 获取 block 的 entryId
  const [block] = db.select().from(wfmScheduleBlocks)
    .where(eq(wfmScheduleBlocks.id, blockId)).all();
  if (!block) return c.json({ error: 'block not found' }, 404);

  const result = executeEdit({
    intentType: 'MOVE_BLOCK',
    planId,
    entryId: block.entryId,
    blockId,
    targetRange: { startTime: body.startTime, endTime: body.endTime },
    saveMode: 'commit',
    versionNo: body.versionNo,
  });

  return c.json(result, result.status === 'rejected' ? 400 : 200);
});

router.delete('/:id/blocks/:blockId', async (c) => {
  const planId = Number(c.req.param('id'));
  const blockId = Number(c.req.param('blockId'));
  const versionNo = Number(c.req.query('versionNo'));

  if (!versionNo && versionNo !== 0) {
    return c.json({ error: 'versionNo query 参数不能为空（乐观锁）' }, 400);
  }

  const [block] = db.select().from(wfmScheduleBlocks)
    .where(eq(wfmScheduleBlocks.id, blockId)).all();
  if (!block) return c.json({ error: 'block not found' }, 404);

  const result = executeEdit({
    intentType: 'DELETE_BLOCK',
    planId,
    entryId: block.entryId,
    blockId,
    saveMode: 'commit',
    versionNo,
  });

  return c.json(result);
});

// ── 全天校验 ──
router.post('/:id/validate', async (c) => {
  const planId = Number(c.req.param('id'));
  const body = await c.req.json();
  if (!body.date) return c.json({ error: 'date 不能为空' }, 400);

  const result = validatePlanDay(planId, body.date);
  return c.json(result);
});

export default router;
