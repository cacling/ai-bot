/**
 * plans.ts — 排班计划 CRUD + 生成 + 时间线 + 覆盖率
 */
import { Hono } from 'hono';
import {
  db, eq, and, sql, desc,
  wfmSchedulePlans, wfmScheduleEntries, wfmScheduleBlocks,
  wfmStaffingRequirements, wfmActivities,
  wfmPlanVersions, wfmPublishLogs,
} from '../db';
import { generateSchedule } from '../services/scheduler';

const router = new Hono();

// ── 计划 CRUD ──

router.get('/', async (c) => {
  const rows = db.select().from(wfmSchedulePlans).all();
  return c.json({ items: rows });
});

router.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.name || !body.startDate || !body.endDate) {
    return c.json({ error: 'name, startDate, endDate 不能为空' }, 400);
  }
  const [row] = db.insert(wfmSchedulePlans).values({
    name: body.name,
    startDate: body.startDate,
    endDate: body.endDate,
    status: 'draft',
    versionNo: 1,
  }).returning().all();
  return c.json(row, 201);
});

router.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const [plan] = db.select().from(wfmSchedulePlans).where(eq(wfmSchedulePlans.id, id)).all();
  if (!plan) return c.json({ error: 'not found' }, 404);

  const entryCount = db.select({ count: sql<number>`count(*)` })
    .from(wfmScheduleEntries)
    .where(eq(wfmScheduleEntries.planId, id)).all()[0]?.count ?? 0;

  return c.json({ ...plan, entryCount });
});

router.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  db.update(wfmSchedulePlans).set({
    ...(body.name !== undefined && { name: body.name }),
    ...(body.startDate !== undefined && { startDate: body.startDate }),
    ...(body.endDate !== undefined && { endDate: body.endDate }),
    ...(body.status !== undefined && { status: body.status }),
  }).where(eq(wfmSchedulePlans.id, id)).run();

  const [updated] = db.select().from(wfmSchedulePlans).where(eq(wfmSchedulePlans.id, id)).all();
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json(updated);
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  // 级联删除 entries → blocks
  const entries = db.select({ id: wfmScheduleEntries.id })
    .from(wfmScheduleEntries)
    .where(eq(wfmScheduleEntries.planId, id)).all();
  for (const entry of entries) {
    db.delete(wfmScheduleBlocks).where(eq(wfmScheduleBlocks.entryId, entry.id)).run();
  }
  db.delete(wfmScheduleEntries).where(eq(wfmScheduleEntries.planId, id)).run();
  db.delete(wfmStaffingRequirements).where(eq(wfmStaffingRequirements.planId, id)).run();
  db.delete(wfmSchedulePlans).where(eq(wfmSchedulePlans.id, id)).run();
  return c.json({ deleted: true });
});

// ── 生成排班 ──

router.post('/:id/generate', async (c) => {
  const id = Number(c.req.param('id'));
  const [plan] = db.select().from(wfmSchedulePlans).where(eq(wfmSchedulePlans.id, id)).all();
  if (!plan) return c.json({ error: 'not found' }, 404);

  // 幂等：已生成/已发布则直接返回现有结果
  if (plan.status === 'generated' || plan.status === 'published') {
    return c.json({ planId: id, status: plan.status, idempotent: true });
  }

  const result = generateSchedule({
    planId: id,
    startDate: plan.startDate,
    endDate: plan.endDate,
  });

  // 更新计划状态
  db.update(wfmSchedulePlans).set({ status: 'generated' })
    .where(eq(wfmSchedulePlans.id, id)).run();

  return c.json({
    planId: id,
    status: 'generated',
    ...result,
  });
});

// ── 时间线查询 ──

router.get('/:id/timeline', async (c) => {
  const planId = Number(c.req.param('id'));
  const date = c.req.query('date');

  let entriesQuery = db.select().from(wfmScheduleEntries)
    .where(eq(wfmScheduleEntries.planId, planId));
  if (date) {
    entriesQuery = entriesQuery.where(
      and(eq(wfmScheduleEntries.planId, planId), eq(wfmScheduleEntries.date, date)),
    ) as typeof entriesQuery;
  }
  const entries = entriesQuery.all();

  // 加载活动类型的颜色/名称映射
  const activities = db.select().from(wfmActivities).all();
  const actMap = new Map(activities.map(a => [a.id, a]));

  const timeline = entries.map(entry => {
    const blocks = db.select().from(wfmScheduleBlocks)
      .where(eq(wfmScheduleBlocks.entryId, entry.id)).all();

    return {
      ...entry,
      blocks: blocks.map(b => ({
        ...b,
        activityCode: actMap.get(b.activityId)?.code ?? 'UNKNOWN',
        activityName: actMap.get(b.activityId)?.name ?? '未知',
        color: actMap.get(b.activityId)?.color ?? '#9ca3af',
      })),
    };
  });

  return c.json({ items: timeline });
});

// ── 覆盖率（30 分钟时间槽统计）──

router.get('/:id/coverage', async (c) => {
  const planId = Number(c.req.param('id'));
  const date = c.req.query('date');
  if (!date) return c.json({ error: 'date 参数必填' }, 400);

  const entries = db.select().from(wfmScheduleEntries)
    .where(and(eq(wfmScheduleEntries.planId, planId), eq(wfmScheduleEntries.date, date)))
    .all();

  // 获取 WORK 活动 ID
  const workAct = db.select().from(wfmActivities)
    .where(eq(wfmActivities.code, 'WORK')).all()[0];
  if (!workAct) return c.json({ slots: [] });

  // 收集所有 WORK 块
  const workBlocks: Array<{ staffId: string; start: number; end: number }> = [];
  for (const entry of entries) {
    const blocks = db.select().from(wfmScheduleBlocks)
      .where(and(eq(wfmScheduleBlocks.entryId, entry.id), eq(wfmScheduleBlocks.activityId, workAct.id)))
      .all();
    for (const b of blocks) {
      workBlocks.push({
        staffId: entry.staffId,
        start: new Date(b.startTime).getTime(),
        end: new Date(b.endTime).getTime(),
      });
    }
  }

  // 生成 30 分钟时间槽（00:00-24:00）
  const dayStart = new Date(date + 'T00:00:00Z').getTime();
  const slots: Array<{ time: string; agents: number }> = [];
  for (let m = 0; m < 24 * 60; m += 30) {
    const slotStart = dayStart + m * 60000;
    const slotEnd = slotStart + 30 * 60000;
    const agentsInSlot = new Set<string>();

    for (const wb of workBlocks) {
      if (wb.start < slotEnd && wb.end > slotStart) {
        agentsInSlot.add(wb.staffId);
      }
    }

    const h = String(Math.floor(m / 60)).padStart(2, '0');
    const min = String(m % 60).padStart(2, '0');
    slots.push({ time: `${h}:${min}`, agents: agentsInSlot.size });
  }

  return c.json({ date, slots });
});

// ── 发布前校验 ──

router.post('/:id/publish/validate', async (c) => {
  const planId = Number(c.req.param('id'));
  const [plan] = db.select().from(wfmSchedulePlans).where(eq(wfmSchedulePlans.id, planId)).all();
  if (!plan) return c.json({ error: 'not found' }, 404);

  const { validatePlanDay } = await import('../services/validator');

  // 校验计划日期范围内每一天
  const allErrors: any[] = [];
  const allWarnings: any[] = [];
  const start = new Date(plan.startDate + 'T00:00:00Z');
  const end = new Date(plan.endDate + 'T00:00:00Z');

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const result = validatePlanDay(planId, dateStr);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  return c.json({
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  });
});

// ── 发布 ──

router.post('/:id/publish', async (c) => {
  const planId = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const [plan] = db.select().from(wfmSchedulePlans).where(eq(wfmSchedulePlans.id, planId)).all();
  if (!plan) return c.json({ error: 'not found' }, 404);
  // 幂等：已发布返回当前版本
  if (plan.status === 'published') return c.json({ planId, status: 'published', versionNo: plan.versionNo, idempotent: true });

  // 保存版本快照
  const entries = db.select().from(wfmScheduleEntries)
    .where(eq(wfmScheduleEntries.planId, planId)).all();
  const snapshot: any[] = [];
  for (const entry of entries) {
    const blocks = db.select().from(wfmScheduleBlocks)
      .where(eq(wfmScheduleBlocks.entryId, entry.id)).all();
    snapshot.push({ entry, blocks });
  }

  const newVersion = plan.versionNo + 1;

  db.insert(wfmPlanVersions).values({
    planId,
    versionNo: newVersion,
    snapshotJson: JSON.stringify(snapshot),
  }).run();

  // 锁定所有条目
  for (const entry of entries) {
    db.update(wfmScheduleEntries).set({ status: 'published' })
      .where(eq(wfmScheduleEntries.id, entry.id)).run();
  }

  // 更新计划状态
  db.update(wfmSchedulePlans).set({
    status: 'published',
    versionNo: newVersion,
    publishedAt: new Date().toISOString(),
    publishedBy: body.publishedBy ?? null,
  }).where(eq(wfmSchedulePlans.id, planId)).run();

  // 发布日志
  db.insert(wfmPublishLogs).values({
    planId,
    versionNo: newVersion,
    operatorId: body.publishedBy ?? null,
    operatorName: body.publisherName ?? null,
    action: 'publish',
    note: body.note ?? null,
  }).run();

  return c.json({ planId, status: 'published', versionNo: newVersion });
});

// ── 回滚 ──

router.post('/:id/rollback', async (c) => {
  const planId = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const targetVersion = body.targetVersion;

  const [plan] = db.select().from(wfmSchedulePlans).where(eq(wfmSchedulePlans.id, planId)).all();
  if (!plan) return c.json({ error: 'not found' }, 404);

  // 找到目标版本快照
  const versions = db.select().from(wfmPlanVersions)
    .where(eq(wfmPlanVersions.planId, planId)).all();

  const targetSnap = targetVersion
    ? versions.find(v => v.versionNo === targetVersion)
    : versions.sort((a, b) => b.versionNo - a.versionNo)[0]; // 最新版本

  if (!targetSnap) return c.json({ error: '没有可回滚的版本' }, 400);

  const snapshot = JSON.parse(targetSnap.snapshotJson) as Array<{ entry: any; blocks: any[] }>;

  // 清空当前数据
  const currentEntries = db.select({ id: wfmScheduleEntries.id })
    .from(wfmScheduleEntries).where(eq(wfmScheduleEntries.planId, planId)).all();
  for (const e of currentEntries) {
    db.delete(wfmScheduleBlocks).where(eq(wfmScheduleBlocks.entryId, e.id)).run();
  }
  db.delete(wfmScheduleEntries).where(eq(wfmScheduleEntries.planId, planId)).run();

  // 恢复快照
  for (const item of snapshot) {
    const [newEntry] = db.insert(wfmScheduleEntries).values({
      planId: item.entry.planId,
      staffId: item.entry.staffId,
      date: item.entry.date,
      shiftId: item.entry.shiftId,
      status: 'editable',
    }).returning().all();

    for (const block of item.blocks) {
      db.insert(wfmScheduleBlocks).values({
        entryId: newEntry.id,
        activityId: block.activityId,
        startTime: block.startTime,
        endTime: block.endTime,
        source: block.source,
        locked: block.locked,
      }).run();
    }
  }

  const newVersion = plan.versionNo + 1;
  db.update(wfmSchedulePlans).set({
    status: 'editing',
    versionNo: newVersion,
  }).where(eq(wfmSchedulePlans.id, planId)).run();

  db.insert(wfmPublishLogs).values({
    planId,
    versionNo: newVersion,
    operatorId: body.operatorId ?? null,
    operatorName: body.operatorName ?? null,
    action: 'rollback',
    note: `回滚到版本 ${targetSnap.versionNo}`,
  }).run();

  return c.json({ planId, status: 'editing', versionNo: newVersion, rolledBackTo: targetSnap.versionNo });
});

// ── 版本历史 ──

router.get('/:id/history', async (c) => {
  const planId = Number(c.req.param('id'));

  const versions = db.select({
    id: wfmPlanVersions.id,
    versionNo: wfmPlanVersions.versionNo,
    createdAt: wfmPlanVersions.createdAt,
  }).from(wfmPlanVersions)
    .where(eq(wfmPlanVersions.planId, planId)).all();

  const logs = db.select().from(wfmPublishLogs)
    .where(eq(wfmPublishLogs.planId, planId)).all();

  return c.json({ versions, logs });
});

export default router;
