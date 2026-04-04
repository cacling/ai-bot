/**
 * validator.ts — 排班校验规则
 *
 * 提供单日全局校验 + 活动覆盖检查
 */

import {
  db, eq, and,
  wfmScheduleEntries, wfmScheduleBlocks, wfmActivities,
  wfmStaffContracts, wfmContracts, wfmGroups, wfmGroupMembers,
  wfmActivityCoverRules, wfmStaffingRequirements, wfmShifts,
} from '../db';

export interface ValidationItem {
  level: 'error' | 'warning' | 'info';
  ruleCode: string;
  message: string;
  confirmable: boolean;
  staffId?: string;
  date?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationItem[];
  warnings: ValidationItem[];
  infos: ValidationItem[];
}

/** 检查活动 A 是否可以覆盖活动 B */
export function canActivityCover(sourceActivityId: number, targetActivityId: number): boolean {
  const rules = db.select().from(wfmActivityCoverRules)
    .where(and(
      eq(wfmActivityCoverRules.sourceActivityId, sourceActivityId),
      eq(wfmActivityCoverRules.targetActivityId, targetActivityId),
    )).all();

  if (rules.length === 0) return false;
  return rules[0].canCover;
}

/** 校验计划某一天的全部规则 */
export function validatePlanDay(planId: number, date: string): ValidationResult {
  const errors: ValidationItem[] = [];
  const warnings: ValidationItem[] = [];
  const infos: ValidationItem[] = [];

  const entries = db.select().from(wfmScheduleEntries)
    .where(and(eq(wfmScheduleEntries.planId, planId), eq(wfmScheduleEntries.date, date)))
    .all();

  // 加载活动类型映射
  const activities = db.select().from(wfmActivities).all();
  const actMap = new Map(activities.map(a => [a.id, a]));
  const workAct = activities.find(a => a.code === 'WORK');
  const lunchAct = activities.find(a => a.code === 'LUNCH');
  const breakAct = activities.find(a => a.code === 'BREAK');

  for (const entry of entries) {
    const blocks = db.select().from(wfmScheduleBlocks)
      .where(eq(wfmScheduleBlocks.entryId, entry.id)).all();

    // 获取坐席合同
    const [staffContract] = db.select().from(wfmStaffContracts)
      .where(eq(wfmStaffContracts.staffId, entry.staffId)).all();
    if (!staffContract) continue;

    const [contract] = db.select().from(wfmContracts)
      .where(eq(wfmContracts.id, staffContract.contractId)).all();
    if (!contract) continue;

    // ── CONTRACT_DAILY_HOURS ──
    let paidMinutes = 0;
    for (const b of blocks) {
      const act = actMap.get(b.activityId);
      if (act?.isPaid) {
        const dur = (new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 60000;
        paidMinutes += dur;
      }
    }
    const paidHours = paidMinutes / 60;

    if (paidHours < contract.minHoursDay) {
      errors.push({
        level: 'error', ruleCode: 'CONTRACT_DAILY_HOURS', confirmable: false,
        staffId: entry.staffId, date,
        message: `日工时 ${paidHours.toFixed(1)}h 低于合同最低 ${contract.minHoursDay}h`,
      });
    }
    if (paidHours > contract.maxHoursDay) {
      errors.push({
        level: 'error', ruleCode: 'CONTRACT_DAILY_HOURS', confirmable: false,
        staffId: entry.staffId, date,
        message: `日工时 ${paidHours.toFixed(1)}h 超过合同最高 ${contract.maxHoursDay}h`,
      });
    }

    // ── MEAL_REQUIRED ──
    if (contract.lunchRequired && lunchAct) {
      const hasLunch = blocks.some(b => b.activityId === lunchAct.id);
      if (!hasLunch) {
        warnings.push({
          level: 'warning', ruleCode: 'MEAL_REQUIRED', confirmable: true,
          staffId: entry.staffId, date,
          message: `合同要求午餐但当天未安排`,
        });
      }
    }

    // ── MIN_BREAK ──
    if (breakAct && contract.minBreakMinutes > 0) {
      let breakMinutes = 0;
      for (const b of blocks) {
        if (b.activityId === breakAct.id) {
          breakMinutes += (new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 60000;
        }
      }
      if (breakMinutes < contract.minBreakMinutes) {
        warnings.push({
          level: 'warning', ruleCode: 'MIN_BREAK', confirmable: true,
          staffId: entry.staffId, date,
          message: `小休 ${breakMinutes}min 低于合同最低 ${contract.minBreakMinutes}min`,
        });
      }
    }
  }

  // ── GROUP_SYNC ──
  const groups = db.select().from(wfmGroups).all();
  for (const group of groups) {
    const members = db.select().from(wfmGroupMembers)
      .where(eq(wfmGroupMembers.groupId, group.id)).all();
    if (members.length < 2) continue;

    const memberEntries = entries.filter(e => members.some(m => m.staffId === e.staffId));
    if (memberEntries.length < 2) continue;

    const shiftStarts: number[] = [];
    const shiftEnds: number[] = [];

    for (const me of memberEntries) {
      if (!me.shiftId) continue;
      const [shift] = db.select().from(wfmShifts).where(eq(wfmShifts.id, me.shiftId)).all();
      if (!shift) continue;
      const [h1, m1] = shift.startTime.split(':').map(Number);
      const [h2, m2] = shift.endTime.split(':').map(Number);
      shiftStarts.push(h1 * 60 + m1);
      shiftEnds.push(h2 * 60 + m2);
    }

    if (shiftStarts.length >= 2) {
      const startDiff = Math.max(...shiftStarts) - Math.min(...shiftStarts);
      const endDiff = Math.max(...shiftEnds) - Math.min(...shiftEnds);

      if (startDiff > group.maxStartDiffMinutes) {
        warnings.push({
          level: 'warning', ruleCode: 'GROUP_SYNC', confirmable: true, date,
          message: `组「${group.name}」上班时差 ${startDiff}min 超过限制 ${group.maxStartDiffMinutes}min`,
        });
      }
      if (endDiff > group.maxEndDiffMinutes) {
        warnings.push({
          level: 'warning', ruleCode: 'GROUP_SYNC', confirmable: true, date,
          message: `组「${group.name}」下班时差 ${endDiff}min 超过限制 ${group.maxEndDiffMinutes}min`,
        });
      }
    }
  }

  // ── STAFFING_COVERAGE ──
  const requirements = db.select().from(wfmStaffingRequirements)
    .where(and(eq(wfmStaffingRequirements.planId, planId), eq(wfmStaffingRequirements.date, date)))
    .all();

  for (const req of requirements) {
    if (!workAct) continue;
    // req.startTime 可能是完整 ISO "2026-04-03T09:00:00" 或简写 "09:00"
    const reqStartStr = req.startTime.includes('T') ? req.startTime : `${date}T${req.startTime}:00`;
    const reqEndStr = req.endTime.includes('T') ? req.endTime : `${date}T${req.endTime}:00`;
    const reqStart = new Date(reqStartStr).getTime();
    const reqEnd = new Date(reqEndStr).getTime();
    const staffInRange = new Set<string>();

    for (const entry of entries) {
      const blocks = db.select().from(wfmScheduleBlocks)
        .where(and(eq(wfmScheduleBlocks.entryId, entry.id), eq(wfmScheduleBlocks.activityId, workAct.id)))
        .all();
      for (const b of blocks) {
        const bStart = new Date(b.startTime).getTime();
        const bEnd = new Date(b.endTime).getTime();
        if (bStart < reqEnd && bEnd > reqStart) {
          staffInRange.add(entry.staffId);
        }
      }
    }

    if (staffInRange.size < req.minAgents) {
      errors.push({
        level: 'error', ruleCode: 'STAFFING_COVERAGE', confirmable: false, date,
        message: `${req.startTime}-${req.endTime} 在岗 ${staffInRange.size} 人，低于要求 ${req.minAgents} 人`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    infos,
  };
}
