/**
 * edit-service.ts — 两阶段排班编辑引擎
 *
 * preview: 计算 mutation + 本地校验，不写 DB
 * commit: 校验 + 写 DB + 重叠处理 + WORK 重建 + 审计
 */

import {
  db, eq, and, sqlite,
  wfmSchedulePlans, wfmScheduleEntries, wfmScheduleBlocks,
  wfmActivities, wfmShifts,
  wfmChangeOperations, wfmChangeItems,
} from '../db';
import { snapTime } from './snap';
import { canActivityCover, validatePlanDay, type ValidationItem } from './validator';

/** 从 ISO 时间字符串解析 HH:MM 为分钟数（避免 new Date 时区偏移） */
function parseHHMM(iso: string): number {
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

// ── 类型定义 ──

export type IntentType =
  | 'INSERT_ACTIVITY'
  | 'MOVE_BLOCK'
  | 'RESIZE_LEFT'
  | 'RESIZE_RIGHT'
  | 'COVER_WITH_ACTIVITY'
  | 'REPLACE_WITH_LEAVE'
  | 'DELETE_BLOCK';

export interface EditIntentCommand {
  intentType: IntentType;
  planId: number;
  entryId: number;
  blockId?: number;
  activityId?: number;
  leaveTypeId?: number;
  targetRange?: { startTime: string; endTime: string };
  saveMode: 'preview' | 'commit';
  versionNo: number;
  confirmWarnings?: boolean;
}

export interface EditResult {
  operationId: number | null;
  status: 'preview_ready' | 'committed' | 'rejected';
  versionNo: number;
  validation: {
    valid: boolean;
    errors: ValidationItem[];
    warnings: ValidationItem[];
  };
  updatedBlocks: any[];
}

interface MutationItem {
  type: 'add' | 'update' | 'delete';
  blockId?: number;
  before?: any;
  after?: any;
  data?: any;
}

// ── 主入口 ──

export function executeEdit(cmd: EditIntentCommand): EditResult {
  // 1. 加载计划和条目
  const [plan] = db.select().from(wfmSchedulePlans)
    .where(eq(wfmSchedulePlans.id, cmd.planId)).all();
  if (!plan) return rejected('计划不存在', 0);

  // 已发布的计划不允许编辑
  if (plan.status === 'published') {
    return rejected('计划已发布，不允许编辑', plan.versionNo);
  }

  // 版本检查
  if (cmd.versionNo !== plan.versionNo) {
    return rejected(`版本冲突: 期望 ${cmd.versionNo}, 当前 ${plan.versionNo}`, plan.versionNo);
  }

  const [entry] = db.select().from(wfmScheduleEntries)
    .where(eq(wfmScheduleEntries.id, cmd.entryId)).all();
  if (!entry) return rejected('排班条目不存在', plan.versionNo);

  // 2. 计算 mutations
  const mutations = computeMutations(cmd, entry);

  // 3. 本地校验（edit_preview 阶段）
  const previewErrors = validatePreview(cmd, entry, mutations);

  if (cmd.saveMode === 'preview') {
    const blocks = getEntryBlocks(entry.id);
    return {
      operationId: null,
      status: previewErrors.length > 0 ? 'rejected' : 'preview_ready',
      versionNo: plan.versionNo,
      validation: { valid: previewErrors.length === 0, errors: previewErrors, warnings: [] },
      updatedBlocks: blocks,
    };
  }

  // 4. commit 阶段：全局校验
  if (previewErrors.length > 0) {
    return {
      operationId: null,
      status: 'rejected',
      versionNo: plan.versionNo,
      validation: { valid: false, errors: previewErrors, warnings: [] },
      updatedBlocks: getEntryBlocks(entry.id),
    };
  }

  // 5-10. 在事务中执行：应用 mutations → 审计 → 版本递增
  // 注：日级校验（STAFFING_COVERAGE / GROUP_SYNC 等）仅在发布时阻塞，编辑阶段作为信息返回
  sqlite.exec('BEGIN');
  try {
    // 5. 应用 mutations → DB
    applyMutations(mutations, entry.id);

    // 6. 重叠处理
    resolveOverlaps(entry.id);

    // 7. WORK 重建
    rebuildWorkBlocks(entry.id);

    // 8. 审计记录
    const [operation] = db.insert(wfmChangeOperations).values({
      planId: cmd.planId,
      operatorId: null,
      operatorName: null,
      intentType: cmd.intentType,
      saveMode: 'commit',
      status: 'committed',
      versionNo: plan.versionNo + 1,
    }).returning().all();

    for (const m of mutations) {
      db.insert(wfmChangeItems).values({
        operationId: operation.id,
        entryId: entry.id,
        blockId: m.blockId ?? null,
        changeType: m.type,
        beforeJson: m.before ? JSON.stringify(m.before) : null,
        afterJson: (m.after ?? m.data) ? JSON.stringify(m.after ?? m.data) : null,
      }).run();
    }

    // 9. 版本递增
    db.update(wfmSchedulePlans).set({
      versionNo: plan.versionNo + 1,
      status: 'editing',
    }).where(eq(wfmSchedulePlans.id, cmd.planId)).run();

    sqlite.exec('COMMIT');

    // 10. 提交后运行日级校验（非阻塞，仅供客户端展示）
    const dayValidation = validatePlanDay(cmd.planId, entry.date);

    return {
      operationId: operation.id,
      status: 'committed' as const,
      versionNo: plan.versionNo + 1,
      validation: { valid: dayValidation.valid, errors: dayValidation.errors, warnings: dayValidation.warnings },
      updatedBlocks: getEntryBlocks(entry.id),
    };
  } catch (err) {
    sqlite.exec('ROLLBACK');
    return rejected(`编辑失败: ${String(err)}`, plan.versionNo);
  }
}

// ── Mutation 计算 ──

function computeMutations(cmd: EditIntentCommand, entry: any): MutationItem[] {
  const items: MutationItem[] = [];

  switch (cmd.intentType) {
    case 'INSERT_ACTIVITY': {
      if (!cmd.activityId || !cmd.targetRange) break;
      items.push({
        type: 'add',
        data: {
          entryId: entry.id,
          activityId: cmd.activityId,
          startTime: snapTime(cmd.targetRange.startTime),
          endTime: snapTime(cmd.targetRange.endTime),
          source: 'manual',
          locked: false,
        },
      });
      break;
    }
    case 'MOVE_BLOCK': {
      if (!cmd.blockId || !cmd.targetRange) break;
      const [block] = db.select().from(wfmScheduleBlocks)
        .where(eq(wfmScheduleBlocks.id, cmd.blockId)).all();
      if (!block) break;
      items.push({
        type: 'update',
        blockId: cmd.blockId,
        before: { startTime: block.startTime, endTime: block.endTime },
        after: {
          startTime: snapTime(cmd.targetRange.startTime),
          endTime: snapTime(cmd.targetRange.endTime),
        },
      });
      break;
    }
    case 'RESIZE_LEFT': {
      if (!cmd.blockId || !cmd.targetRange) break;
      const [block] = db.select().from(wfmScheduleBlocks)
        .where(eq(wfmScheduleBlocks.id, cmd.blockId)).all();
      if (!block) break;
      items.push({
        type: 'update',
        blockId: cmd.blockId,
        before: { startTime: block.startTime },
        after: { startTime: snapTime(cmd.targetRange.startTime) },
      });
      break;
    }
    case 'RESIZE_RIGHT': {
      if (!cmd.blockId || !cmd.targetRange) break;
      const [block] = db.select().from(wfmScheduleBlocks)
        .where(eq(wfmScheduleBlocks.id, cmd.blockId)).all();
      if (!block) break;
      items.push({
        type: 'update',
        blockId: cmd.blockId,
        before: { endTime: block.endTime },
        after: { endTime: snapTime(cmd.targetRange.endTime) },
      });
      break;
    }
    case 'COVER_WITH_ACTIVITY': {
      if (!cmd.activityId || !cmd.targetRange) break;
      items.push({
        type: 'add',
        data: {
          entryId: entry.id,
          activityId: cmd.activityId,
          startTime: snapTime(cmd.targetRange.startTime),
          endTime: snapTime(cmd.targetRange.endTime),
          source: 'manual',
          locked: false,
        },
      });
      break;
    }
    case 'REPLACE_WITH_LEAVE': {
      if (!cmd.activityId || !cmd.targetRange) break;
      const sStart = snapTime(cmd.targetRange.startTime);
      const sEnd = snapTime(cmd.targetRange.endTime);

      // 删除范围内所有未锁定块
      const blocks = db.select().from(wfmScheduleBlocks)
        .where(eq(wfmScheduleBlocks.entryId, entry.id)).all();
      for (const b of blocks) {
        if (b.locked) continue;
        const bStart = new Date(b.startTime).getTime();
        const bEnd = new Date(b.endTime).getTime();
        const rStart = new Date(sStart).getTime();
        const rEnd = new Date(sEnd).getTime();
        if (bStart < rEnd && bEnd > rStart) {
          items.push({ type: 'delete', blockId: b.id, before: b });
        }
      }

      // 插入假勤活动块
      items.push({
        type: 'add',
        data: {
          entryId: entry.id,
          activityId: cmd.activityId,
          startTime: sStart,
          endTime: sEnd,
          source: 'leave',
          locked: false,
        },
      });
      break;
    }
    case 'DELETE_BLOCK': {
      if (!cmd.blockId) break;
      const [block] = db.select().from(wfmScheduleBlocks)
        .where(eq(wfmScheduleBlocks.id, cmd.blockId)).all();
      if (block) {
        items.push({ type: 'delete', blockId: cmd.blockId, before: block });
      }
      break;
    }
  }

  return items;
}

// ── Preview 校验 ──

function validatePreview(cmd: EditIntentCommand, entry: any, mutations: MutationItem[]): ValidationItem[] {
  const errors: ValidationItem[] = [];

  // MIN_DURATION: 检查新增/更新块的最小时长（15 分钟）
  for (const m of mutations) {
    if (m.type === 'add' && m.data) {
      const dur = (new Date(m.data.endTime).getTime() - new Date(m.data.startTime).getTime()) / 60000;
      if (dur < 15) {
        errors.push({ level: 'error', ruleCode: 'MIN_DURATION', confirmable: false,
          message: `活动块时长 ${dur}min 低于最小 15min` });
      }
    }
    if (m.type === 'update' && m.after) {
      if (m.after.startTime && m.after.endTime) {
        const dur = (new Date(m.after.endTime).getTime() - new Date(m.after.startTime).getTime()) / 60000;
        if (dur < 15) {
          errors.push({ level: 'error', ruleCode: 'MIN_DURATION', confirmable: false,
            message: `活动块时长 ${dur}min 低于最小 15min` });
        }
      }
    }
  }

  // SHIFT_BOUNDARY: 检查是否超出班次边界
  if (entry.shiftId && cmd.targetRange) {
    const [shift] = db.select().from(wfmShifts).where(eq(wfmShifts.id, entry.shiftId)).all();
    if (shift) {
      const [sh, sm] = shift.startTime.split(':').map(Number);
      const [eh, em] = shift.endTime.split(':').map(Number);
      const shiftStartMin = sh * 60 + sm;
      let shiftEndMin = eh * 60 + em;
      if (shiftEndMin <= shiftStartMin) shiftEndMin += 24 * 60;

      const snappedStart = snapTime(cmd.targetRange.startTime);
      const snappedEnd = snapTime(cmd.targetRange.endTime);
      // 解析为分钟数，跨日块需加 24*60 偏移
      let tStartMin = parseHHMM(snappedStart);
      let tEndMin = parseHHMM(snappedEnd);
      // 跨日处理：after-midnight 部分的分钟数需要 +1440
      if (tStartMin < shiftStartMin) tStartMin += 24 * 60;
      if (tEndMin <= tStartMin) tEndMin += 24 * 60;

      if (tStartMin < shiftStartMin || tEndMin > shiftEndMin) {
        errors.push({ level: 'error', ruleCode: 'SHIFT_BOUNDARY', confirmable: false,
          message: `操作超出班次边界 ${shift.startTime}-${shift.endTime}` });
      }
    }
  }

  // ACTIVITY_COVER: 检查覆盖规则
  if (cmd.intentType === 'COVER_WITH_ACTIVITY' && cmd.activityId && cmd.targetRange) {
    const sStart = new Date(snapTime(cmd.targetRange.startTime)).getTime();
    const sEnd = new Date(snapTime(cmd.targetRange.endTime)).getTime();
    const blocks = db.select().from(wfmScheduleBlocks)
      .where(eq(wfmScheduleBlocks.entryId, entry.id)).all();

    for (const b of blocks) {
      const bStart = new Date(b.startTime).getTime();
      const bEnd = new Date(b.endTime).getTime();
      if (bStart < sEnd && bEnd > sStart && b.activityId !== cmd.activityId) {
        if (!canActivityCover(cmd.activityId, b.activityId)) {
          const targetAct = db.select().from(wfmActivities)
            .where(eq(wfmActivities.id, b.activityId)).all()[0];
          const sourceAct = db.select().from(wfmActivities)
            .where(eq(wfmActivities.id, cmd.activityId)).all()[0];
          errors.push({
            level: 'error', ruleCode: 'ACTIVITY_COVER', confirmable: false,
            message: `${sourceAct?.name ?? '活动'} 不能覆盖 ${targetAct?.name ?? '活动'}`,
          });
        }
      }
    }
  }

  return errors;
}

// ── 应用 Mutations ──

function applyMutations(mutations: MutationItem[], entryId: number) {
  for (const m of mutations) {
    if (m.type === 'add' && m.data) {
      db.insert(wfmScheduleBlocks).values(m.data).run();
    } else if (m.type === 'update' && m.blockId && m.after) {
      db.update(wfmScheduleBlocks).set(m.after)
        .where(eq(wfmScheduleBlocks.id, m.blockId)).run();
    } else if (m.type === 'delete' && m.blockId) {
      db.delete(wfmScheduleBlocks).where(eq(wfmScheduleBlocks.id, m.blockId)).run();
    }
  }
}

// ── 重叠处理 ──

function resolveOverlaps(entryId: number) {
  const workAct = db.select().from(wfmActivities)
    .where(eq(wfmActivities.code, 'WORK')).all()[0];
  if (!workAct) return;

  // 获取所有非 WORK 块，按 id 降序（新块优先）
  const blocks = db.select().from(wfmScheduleBlocks)
    .where(eq(wfmScheduleBlocks.entryId, entryId)).all()
    .filter(b => b.activityId !== workAct.id)
    .sort((a, b) => b.id - a.id);

  for (let i = 0; i < blocks.length; i++) {
    const newer = blocks[i];
    const nStart = parseHHMM(newer.startTime);
    const nEnd = parseHHMM(newer.endTime);

    for (let j = i + 1; j < blocks.length; j++) {
      const older = blocks[j];
      const oStart = parseHHMM(older.startTime);
      const oEnd = parseHHMM(older.endTime);

      if (nStart >= oEnd || nEnd <= oStart) continue; // no overlap

      if (nStart <= oStart && nEnd >= oEnd) {
        // 新块完全覆盖旧块
        db.delete(wfmScheduleBlocks).where(eq(wfmScheduleBlocks.id, older.id)).run();
      } else if (nStart > oStart && nEnd < oEnd) {
        // 新块在旧块中间 → 缩短旧块 + 补尾
        db.update(wfmScheduleBlocks)
          .set({ endTime: newer.startTime })
          .where(eq(wfmScheduleBlocks.id, older.id)).run();
        db.insert(wfmScheduleBlocks).values({
          entryId,
          activityId: older.activityId,
          startTime: newer.endTime,
          endTime: older.endTime,
          source: older.source,
          locked: older.locked,
        }).run();
      } else if (nStart <= oStart) {
        // 新块覆盖旧块左侧
        db.update(wfmScheduleBlocks)
          .set({ startTime: newer.endTime })
          .where(eq(wfmScheduleBlocks.id, older.id)).run();
      } else {
        // 新块覆盖旧块右侧
        db.update(wfmScheduleBlocks)
          .set({ endTime: newer.startTime })
          .where(eq(wfmScheduleBlocks.id, older.id)).run();
      }
    }
  }
}

// ── WORK 块重建 ──

function rebuildWorkBlocks(entryId: number) {
  const workAct = db.select().from(wfmActivities)
    .where(eq(wfmActivities.code, 'WORK')).all()[0];
  if (!workAct) return;

  // 删除所有 WORK 块
  const allBlocks = db.select().from(wfmScheduleBlocks)
    .where(eq(wfmScheduleBlocks.entryId, entryId)).all();
  for (const b of allBlocks) {
    if (b.activityId === workAct.id) {
      db.delete(wfmScheduleBlocks).where(eq(wfmScheduleBlocks.id, b.id)).run();
    }
  }

  // 获取条目的班次信息
  const [entry] = db.select().from(wfmScheduleEntries)
    .where(eq(wfmScheduleEntries.id, entryId)).all();
  if (!entry?.shiftId) return;

  const [shift] = db.select().from(wfmShifts).where(eq(wfmShifts.id, entry.shiftId)).all();
  if (!shift) return;

  // 计算班次边界（分钟数，纯本地时间，不经过 Date）
  const [sh, sm] = shift.startTime.split(':').map(Number);
  const [eh, em] = shift.endTime.split(':').map(Number);
  const shiftStartMin = sh * 60 + sm;
  let shiftEndMin = eh * 60 + em;
  // 如果结束时间 <= 开始时间，说明跨日（如 16:00-00:00 → endMin=1440）
  if (shiftEndMin <= shiftStartMin) shiftEndMin += 24 * 60;

  /** 本地时间字符串 → 分钟数（跨日块自动加 1440 偏移） */
  const toMin = (iso: string) => {
    let m = parseHHMM(iso);
    // 跨日：如果时间部分小于班次开始，说明是次日，加 24*60
    if (m < shiftStartMin) m += 24 * 60;
    return m;
  };
  /** 当天分钟数 → 本地时间字符串（支持跨日 >= 1440） */
  const fromMin = (m: number) => {
    const dayOffset = Math.floor(m / (24 * 60));
    const dayMin = m % (24 * 60);
    const hh = String(Math.floor(dayMin / 60)).padStart(2, '0');
    const mm = String(dayMin % 60).padStart(2, '0');
    let dateStr = entry.date;
    if (dayOffset > 0) {
      const d = new Date(entry.date + 'T12:00:00');
      d.setDate(d.getDate() + dayOffset);
      dateStr = d.toISOString().slice(0, 10);
    }
    return `${dateStr}T${hh}:${mm}:00`;
  };

  // 获取剩余非 WORK 块，按开始时间排序
  const remaining = db.select().from(wfmScheduleBlocks)
    .where(eq(wfmScheduleBlocks.entryId, entryId)).all()
    .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));

  // 用 WORK 填充间隙
  let cursor = shiftStartMin;
  for (const block of remaining) {
    const bStart = toMin(block.startTime);
    if (bStart > cursor) {
      db.insert(wfmScheduleBlocks).values({
        entryId,
        activityId: workAct.id,
        startTime: fromMin(cursor),
        endTime: fromMin(bStart),
        source: 'algorithm',
        locked: false,
      }).run();
    }
    const bEnd = toMin(block.endTime);
    if (bEnd > cursor) cursor = bEnd;
  }

  // 尾部间隙
  if (cursor < shiftEndMin) {
    db.insert(wfmScheduleBlocks).values({
      entryId,
      activityId: workAct.id,
      startTime: fromMin(cursor),
      endTime: fromMin(shiftEndMin),
      source: 'algorithm',
      locked: false,
    }).run();
  }
}

// ── 辅助 ──

function getEntryBlocks(entryId: number) {
  const blocks = db.select().from(wfmScheduleBlocks)
    .where(eq(wfmScheduleBlocks.entryId, entryId)).all();
  const activities = db.select().from(wfmActivities).all();
  const actMap = new Map(activities.map(a => [a.id, a]));

  return blocks.map(b => ({
    ...b,
    activityCode: actMap.get(b.activityId)?.code ?? 'UNKNOWN',
    activityName: actMap.get(b.activityId)?.name ?? '未知',
    color: actMap.get(b.activityId)?.color ?? '#9ca3af',
  }));
}

function rejected(message: string, versionNo: number): EditResult {
  return {
    operationId: null,
    status: 'rejected',
    versionNo,
    validation: {
      valid: false,
      errors: [{ level: 'error', ruleCode: 'SYSTEM', message, confirmable: false }],
      warnings: [],
    },
    updatedBlocks: [],
  };
}
