/**
 * scheduler.ts — 排班生成算法
 *
 * 1. 清空计划已有 entries/blocks
 * 2. 加载主数据：合同→班次包→班次、班次活动模板、已批准假勤、例外
 * 3. 逐日逐人：跳过全天已批准假→取模轮转选班→生成活动块→叠加例外
 * 4. 返回 { totalEntries, totalBlocks }
 */

import {
  db, eq,
  wfmScheduleEntries, wfmScheduleBlocks,
  wfmStaffContracts, wfmContractPackages, wfmShiftPackageItems,
  wfmShifts, wfmShiftActivities, wfmActivities,
  wfmLeaves, wfmExceptions, wfmGroupMembers,
} from '../db';

interface GenerateOptions {
  planId: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

/** 简单字符串哈希，用于轮转选班 */
function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** YYYY-MM-DD 的 dayOfYear */
function dayOfYear(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z');
  const start = new Date(d.getUTCFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

/** 解析 HH:MM 为分钟偏移 */
function parseTimeMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 日期 + 分钟偏移 → 本地时间串（支持跨日 >= 1440） */
function dateMinutesToISO(dateStr: string, minutes: number): string {
  const dayOffset = Math.floor(minutes / (24 * 60));
  const dayMin = minutes % (24 * 60);
  const hh = String(Math.floor(dayMin / 60)).padStart(2, '0');
  const mm = String(dayMin % 60).padStart(2, '0');
  let ds = dateStr;
  if (dayOffset > 0) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + dayOffset);
    ds = d.toISOString().slice(0, 10);
  }
  return `${ds}T${hh}:${mm}:00`;
}

export function generateSchedule(opts: GenerateOptions) {
  const { planId, startDate, endDate } = opts;

  // ── 1. 清空已有排班数据 ──
  const existingEntries = db.select({ id: wfmScheduleEntries.id })
    .from(wfmScheduleEntries)
    .where(eq(wfmScheduleEntries.planId, planId))
    .all();

  for (const entry of existingEntries) {
    db.delete(wfmScheduleBlocks).where(eq(wfmScheduleBlocks.entryId, entry.id)).run();
  }
  db.delete(wfmScheduleEntries).where(eq(wfmScheduleEntries.planId, planId)).run();

  // ── 2. 预加载主数据 ──

  // 所有坐席（通过 wfmStaffContracts 获取 staffId 列表）
  const staffContracts = db.select().from(wfmStaffContracts).all();
  const staffIds = [...new Set(staffContracts.map(sc => sc.staffId))];

  // contractId → shiftIds[]
  const contractPkgMap = new Map<number, number[]>();
  const allContractPkgs = db.select().from(wfmContractPackages).all();
  const allPkgItems = db.select().from(wfmShiftPackageItems).all();

  for (const cp of allContractPkgs) {
    const shiftIds = allPkgItems
      .filter(pi => pi.packageId === cp.packageId)
      .map(pi => pi.shiftId);
    const existing = contractPkgMap.get(cp.contractId) || [];
    contractPkgMap.set(cp.contractId, [...existing, ...shiftIds]);
  }

  // staffId → contractId
  const staffContractMap = new Map<string, number>();
  for (const sc of staffContracts) {
    staffContractMap.set(sc.staffId, sc.contractId);
  }

  // 班次信息
  const allShifts = db.select().from(wfmShifts).all();
  const shiftMap = new Map(allShifts.map(sh => [sh.id, sh]));

  // 班次活动模板
  const allShiftActivities = db.select().from(wfmShiftActivities).all();
  const shiftActivityMap = new Map<number, typeof allShiftActivities>();
  for (const sa of allShiftActivities) {
    const list = shiftActivityMap.get(sa.shiftId) || [];
    list.push(sa);
    shiftActivityMap.set(sa.shiftId, list);
  }

  // WORK 活动 ID
  const workActivity = db.select().from(wfmActivities)
    .where(eq(wfmActivities.code, 'WORK')).all()[0];

  // 已审批假勤
  const approvedLeaves = db.select().from(wfmLeaves)
    .where(eq(wfmLeaves.status, 'approved')).all();

  // 例外安排
  const allExceptions = db.select().from(wfmExceptions).all();

  let totalEntries = 0;
  let totalBlocks = 0;

  // ── 3. 逐日逐人生成 ──
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const doy = dayOfYear(dateStr);

    for (const staffId of staffIds) {
      // 检查全天已审批假勤
      const hasFullDayLeave = approvedLeaves.some(lv =>
        lv.staffId === staffId &&
        lv.isFullDay &&
        lv.startTime.slice(0, 10) <= dateStr &&
        lv.endTime.slice(0, 10) >= dateStr,
      );
      if (hasFullDayLeave) continue;

      // 获取可用班次
      const contractId = staffContractMap.get(staffId);
      if (!contractId) continue;
      const availableShiftIds = contractPkgMap.get(contractId) || [];
      if (availableShiftIds.length === 0) continue;

      // 轮转选班：(staffHash + dayOfYear) % count
      const staffHash = simpleHash(staffId);
      const shiftIdx = (staffHash + doy) % availableShiftIds.length;
      const selectedShiftId = availableShiftIds[shiftIdx];
      const shift = shiftMap.get(selectedShiftId);
      if (!shift) continue;

      // 创建排班条目
      const [entry] = db.insert(wfmScheduleEntries).values({
        planId,
        staffId,
        date: dateStr,
        shiftId: selectedShiftId,
        status: 'editable',
      }).returning().all();
      totalEntries++;

      // 从班次模板生成活动块
      const templates = shiftActivityMap.get(selectedShiftId) || [];
      const sorted = [...templates].sort((a, b) => a.sortOrder - b.sortOrder);
      const shiftStartMin = parseTimeMinutes(shift.startTime);

      for (const tmpl of sorted) {
        const blockStartMin = shiftStartMin + tmpl.offsetMinutes;
        const blockEndMin = blockStartMin + tmpl.durationMinutes;

        db.insert(wfmScheduleBlocks).values({
          entryId: entry.id,
          activityId: tmpl.activityId,
          startTime: dateMinutesToISO(dateStr, blockStartMin),
          endTime: dateMinutesToISO(dateStr, blockEndMin),
          source: 'algorithm',
          locked: false,
        }).run();
        totalBlocks++;
      }

      // ── 叠加例外安排 ──
      const agentExceptions = allExceptions.filter(ex => {
        if (ex.staffId !== staffId) return false;
        return ex.startTime.slice(0, 10) === dateStr;
      });

      for (const ex of agentExceptions) {
        if (!workActivity) continue;

        // 获取当前 entry 的所有块
        const entryBlocks = db.select().from(wfmScheduleBlocks)
          .where(eq(wfmScheduleBlocks.entryId, entry.id)).all();

        const exStart = new Date(ex.startTime).getTime();
        const exEnd = new Date(ex.endTime).getTime();

        for (const block of entryBlocks) {
          if (block.activityId !== workActivity.id) continue;
          const bStart = new Date(block.startTime).getTime();
          const bEnd = new Date(block.endTime).getTime();

          if (exStart <= bStart && exEnd >= bEnd) {
            // 例外完全覆盖 Work 块 → 删除
            db.delete(wfmScheduleBlocks).where(eq(wfmScheduleBlocks.id, block.id)).run();
          } else if (exStart > bStart && exEnd < bEnd) {
            // 例外部分覆盖（中间切一段）→ 缩短 + 补尾
            db.update(wfmScheduleBlocks)
              .set({ endTime: ex.startTime })
              .where(eq(wfmScheduleBlocks.id, block.id)).run();

            db.insert(wfmScheduleBlocks).values({
              entryId: entry.id,
              activityId: workActivity.id,
              startTime: ex.endTime,
              endTime: block.endTime,
              source: 'algorithm',
              locked: false,
            }).run();
            totalBlocks++;
          } else if (exStart <= bStart && exEnd > bStart && exEnd < bEnd) {
            // 例外覆盖前半段 → 缩短块起始
            db.update(wfmScheduleBlocks)
              .set({ startTime: ex.endTime })
              .where(eq(wfmScheduleBlocks.id, block.id)).run();
          } else if (exStart > bStart && exStart < bEnd && exEnd >= bEnd) {
            // 例外覆盖后半段 → 缩短块结束
            db.update(wfmScheduleBlocks)
              .set({ endTime: ex.startTime })
              .where(eq(wfmScheduleBlocks.id, block.id)).run();
          }
        }

        // 插入例外活动块
        db.insert(wfmScheduleBlocks).values({
          entryId: entry.id,
          activityId: ex.activityId,
          startTime: ex.startTime,
          endTime: ex.endTime,
          source: 'exception',
          locked: false,
        }).run();
        totalBlocks++;
      }
    }
  }

  return { totalEntries, totalBlocks };
}
