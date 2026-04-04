/**
 * seed.ts — WFM 排班系统种子数据
 *
 * 7 名坐席（3 现有 + 4 新增），2 个排班组，4 种班次，3 种合同，6 种技能
 * 含预排休假、临时休假、例外安排、覆盖需求、规则定义
 *
 * 幂等：清空后重新插入
 */

import { db, eq } from './db';
import * as s from '@ai-bot/shared-db/schema/wfm';

/** 格式化日期为 YYYY-MM-DD，支持偏移天数 */
function fmtDate(base: Date, offsetDays: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// ── 坐席 ID 映射（对应 staff_accounts.id） ──
// 现有 3 个
const ZHANG_QI = 'agent_001';   // 张琦 A01 frontline_online 全职
const LI_NA = 'agent_002';      // 李娜 A02 frontline_online 全职
const WANG_LEI = 'agent_callback_01'; // 王蕾 C01 callback_team 全职
// 新增 4 个（需在 backend seed 中追加）
const ZHAO_MIN = 'agent_003';   // 赵敏 A03 frontline_online 全职
const LIU_YANG = 'agent_004';   // 刘洋 A04 frontline_online 兼职
const MA_CHAO = 'agent_005';    // 马超 V01 frontline_voice 全职
const FANG_LIN = 'agent_006';   // 方琳 V02 frontline_voice 弹性

const ALL_STAFF = [ZHANG_QI, LI_NA, WANG_LEI, ZHAO_MIN, LIU_YANG, MA_CHAO, FANG_LIN];

function seed() {
  console.log('[wfm-seed] Seeding database...');

  // 清空所有表（逆依赖序）
  const tables = [
    s.wfmPublishLogs, s.wfmValidationResults, s.wfmChangeItems, s.wfmChangeOperations,
    s.wfmRuleChains, s.wfmRuleBindings, s.wfmRuleDefinitions,
    s.wfmPlanVersions, s.wfmStaffingRequirements, s.wfmScheduleBlocks, s.wfmScheduleEntries, s.wfmSchedulePlans,
    s.wfmExceptions, s.wfmLeaves, s.wfmLeaveTypes,
    s.wfmStaffSkills, s.wfmGroupMembers, s.wfmGroups, s.wfmStaffContracts,
    s.wfmActivityCoverRules, s.wfmContractPackages, s.wfmContracts,
    s.wfmShiftPackageItems, s.wfmShiftPackages, s.wfmShiftActivities, s.wfmShifts, s.wfmShiftPatterns,
    s.wfmSkills, s.wfmActivities,
  ];
  for (const t of tables) db.delete(t).run();

  // ========== 1. 活动类型（8 种） ==========
  const actRows = db.insert(s.wfmActivities).values([
    { code: 'WORK',       name: '工作',     color: '#4ade80', priority: 10, isPaid: true,  isCoverable: true,  canCover: false, icon: 'phone' },
    { code: 'BREAK',      name: '小休',     color: '#facc15', priority: 20, isPaid: true,  isCoverable: false, canCover: true,  icon: 'coffee' },
    { code: 'LUNCH',      name: '午餐',     color: '#fb923c', priority: 30, isPaid: false, isCoverable: false, canCover: true,  icon: 'utensils' },
    { code: 'MEETING',    name: '会议',     color: '#3b82f6', priority: 40, isPaid: true,  isCoverable: true,  canCover: true,  icon: 'users' },
    { code: 'TRAINING',   name: '培训',     color: '#818cf8', priority: 40, isPaid: true,  isCoverable: true,  canCover: true,  icon: 'book' },
    { code: 'OFFLINE',    name: '离线处理', color: '#f97316', priority: 15, isPaid: true,  isCoverable: true,  canCover: true,  icon: 'monitor' },
    { code: 'SICK_LEAVE', name: '病假',     color: '#ef4444', priority: 90, isPaid: true,  isCoverable: false, canCover: true,  icon: 'heart' },
    { code: 'DAY_OFF',    name: '休息日',   color: '#9ca3af', priority: 99, isPaid: false, isCoverable: false, canCover: true,  icon: 'calendar-off' },
  ]).returning().all();
  const act = Object.fromEntries(actRows.map(a => [a.code, a]));
  console.log(`  Activities: ${actRows.length}`);

  // ========== 2. 覆盖规则（11 条） ==========
  db.insert(s.wfmActivityCoverRules).values([
    { sourceActivityId: act.MEETING.id,    targetActivityId: act.WORK.id,     canCover: true },
    { sourceActivityId: act.TRAINING.id,   targetActivityId: act.WORK.id,     canCover: true },
    { sourceActivityId: act.OFFLINE.id,    targetActivityId: act.WORK.id,     canCover: true },
    { sourceActivityId: act.SICK_LEAVE.id, targetActivityId: act.WORK.id,     canCover: true },
    { sourceActivityId: act.SICK_LEAVE.id, targetActivityId: act.BREAK.id,    canCover: true },
    { sourceActivityId: act.SICK_LEAVE.id, targetActivityId: act.LUNCH.id,    canCover: true },
    { sourceActivityId: act.SICK_LEAVE.id, targetActivityId: act.MEETING.id,  canCover: true },
    { sourceActivityId: act.SICK_LEAVE.id, targetActivityId: act.TRAINING.id, canCover: true },
    { sourceActivityId: act.SICK_LEAVE.id, targetActivityId: act.OFFLINE.id,  canCover: true },
    // Training 不能覆盖 Lunch（WFM-06 测试场景）
    { sourceActivityId: act.TRAINING.id,   targetActivityId: act.LUNCH.id,    canCover: false },
    { sourceActivityId: act.MEETING.id,    targetActivityId: act.LUNCH.id,    canCover: false },
  ]).run();
  console.log('  Cover rules: 11');

  // ========== 3. 技能（6 种） ==========
  const skillRows = db.insert(s.wfmSkills).values([
    { code: 'VOICE_CN',     name: '中文语音' },
    { code: 'VOICE_EN',     name: '英文语音' },
    { code: 'ONLINE_CHAT',  name: '在线客服' },
    { code: 'EMAIL',        name: '邮件工单' },
    { code: 'VIP',          name: 'VIP 服务' },
    { code: 'COMPLAINT',    name: '投诉处理' },
  ]).returning().all();
  const sk = Object.fromEntries(skillRows.map(s => [s.code, s]));
  console.log(`  Skills: ${skillRows.length}`);

  // ========== 4. 班制 + 班次（4 种） ==========
  const [pMorning] = db.insert(s.wfmShiftPatterns).values({ name: '早班', description: '08:00-16:00' }).returning().all();
  const [pMidday]  = db.insert(s.wfmShiftPatterns).values({ name: '中班', description: '12:00-20:00' }).returning().all();
  const [pEvening] = db.insert(s.wfmShiftPatterns).values({ name: '晚班', description: '16:00-24:00' }).returning().all();
  const [pFlex]    = db.insert(s.wfmShiftPatterns).values({ name: '弹性班', description: '09:00-16:00' }).returning().all();

  const [shMorning] = db.insert(s.wfmShifts).values({ patternId: pMorning.id, name: '早班 08-16', startTime: '08:00', endTime: '16:00', durationMinutes: 480 }).returning().all();
  const [shMidday]  = db.insert(s.wfmShifts).values({ patternId: pMidday.id,  name: '中班 12-20', startTime: '12:00', endTime: '20:00', durationMinutes: 480 }).returning().all();
  const [shEvening] = db.insert(s.wfmShifts).values({ patternId: pEvening.id, name: '晚班 16-24', startTime: '16:00', endTime: '24:00', durationMinutes: 480 }).returning().all();
  const [shFlex]    = db.insert(s.wfmShifts).values({ patternId: pFlex.id,    name: '弹性 09-16', startTime: '09:00', endTime: '16:00', durationMinutes: 420 }).returning().all();

  // 班次活动模板（Work→Break→Work→Lunch→Work→Break→Work）
  for (const sh of [shMorning, shMidday, shEvening]) {
    db.insert(s.wfmShiftActivities).values([
      { shiftId: sh.id, activityId: act.WORK.id,  offsetMinutes: 0,   durationMinutes: 120, sortOrder: 1 },
      { shiftId: sh.id, activityId: act.BREAK.id, offsetMinutes: 120, durationMinutes: 15,  sortOrder: 2 },
      { shiftId: sh.id, activityId: act.WORK.id,  offsetMinutes: 135, durationMinutes: 105, sortOrder: 3 },
      { shiftId: sh.id, activityId: act.LUNCH.id, offsetMinutes: 240, durationMinutes: 30,  sortOrder: 4 },
      { shiftId: sh.id, activityId: act.WORK.id,  offsetMinutes: 270, durationMinutes: 105, sortOrder: 5 },
      { shiftId: sh.id, activityId: act.BREAK.id, offsetMinutes: 375, durationMinutes: 15,  sortOrder: 6 },
      { shiftId: sh.id, activityId: act.WORK.id,  offsetMinutes: 390, durationMinutes: 90,  sortOrder: 7 },
    ]).run();
  }
  // 弹性班（无 Lunch，只有 Break）
  db.insert(s.wfmShiftActivities).values([
    { shiftId: shFlex.id, activityId: act.WORK.id,  offsetMinutes: 0,   durationMinutes: 120, sortOrder: 1 },
    { shiftId: shFlex.id, activityId: act.BREAK.id, offsetMinutes: 120, durationMinutes: 15,  sortOrder: 2 },
    { shiftId: shFlex.id, activityId: act.WORK.id,  offsetMinutes: 135, durationMinutes: 150, sortOrder: 3 },
    { shiftId: shFlex.id, activityId: act.BREAK.id, offsetMinutes: 285, durationMinutes: 15,  sortOrder: 4 },
    { shiftId: shFlex.id, activityId: act.WORK.id,  offsetMinutes: 300, durationMinutes: 120, sortOrder: 5 },
  ]).run();
  console.log('  Shifts: 4 (早班/中班/晚班/弹性)');

  // ========== 5. 班次包（3 种） ==========
  const [pkgFull]    = db.insert(s.wfmShiftPackages).values({ name: '全班次包' }).returning().all();
  const [pkgMorning] = db.insert(s.wfmShiftPackages).values({ name: '早班包' }).returning().all();
  const [pkgFlex]    = db.insert(s.wfmShiftPackages).values({ name: '弹性包' }).returning().all();

  db.insert(s.wfmShiftPackageItems).values([
    { packageId: pkgFull.id,    shiftId: shMorning.id },
    { packageId: pkgFull.id,    shiftId: shMidday.id },
    { packageId: pkgFull.id,    shiftId: shEvening.id },
    { packageId: pkgMorning.id, shiftId: shMorning.id },
    { packageId: pkgFlex.id,    shiftId: shFlex.id },
  ]).run();
  console.log('  Shift packages: 3');

  // ========== 6. 合同（3 种） ==========
  const [ctFull] = db.insert(s.wfmContracts).values({
    name: '全职 8h', minHoursDay: 6, maxHoursDay: 10, minHoursWeek: 35, maxHoursWeek: 45,
    minBreakMinutes: 15, lunchRequired: true, lunchMinMinutes: 30,
  }).returning().all();
  const [ctPart] = db.insert(s.wfmContracts).values({
    name: '兼职 6h', minHoursDay: 4, maxHoursDay: 8, minHoursWeek: 20, maxHoursWeek: 40,
    minBreakMinutes: 10, lunchRequired: false, lunchMinMinutes: 0,
  }).returning().all();
  const [ctFlex] = db.insert(s.wfmContracts).values({
    name: '弹性 7h', minHoursDay: 5, maxHoursDay: 8, minHoursWeek: 28, maxHoursWeek: 40,
    minBreakMinutes: 15, lunchRequired: false, lunchMinMinutes: 0,
  }).returning().all();

  db.insert(s.wfmContractPackages).values([
    { contractId: ctFull.id, packageId: pkgFull.id },
    { contractId: ctPart.id, packageId: pkgMorning.id },
    { contractId: ctFlex.id, packageId: pkgFlex.id },
  ]).run();
  console.log('  Contracts: 3 (全职/兼职/弹性)');

  // ========== 7. 坐席合同绑定 ==========
  db.insert(s.wfmStaffContracts).values([
    { staffId: ZHANG_QI, contractId: ctFull.id },
    { staffId: LI_NA,    contractId: ctFull.id },
    { staffId: WANG_LEI, contractId: ctFull.id },
    { staffId: ZHAO_MIN, contractId: ctFull.id },
    { staffId: LIU_YANG, contractId: ctPart.id },   // 兼职
    { staffId: MA_CHAO,  contractId: ctFull.id },
    { staffId: FANG_LIN, contractId: ctFlex.id },   // 弹性
  ]).run();
  console.log('  Staff contracts: 7');

  // ========== 8. 假勤类型 ==========
  const ltRows = db.insert(s.wfmLeaveTypes).values([
    { code: 'ANNUAL',   name: '年假', isPaid: true,  maxDaysYear: 15, color: '#60a5fa' },
    { code: 'SICK',     name: '病假', isPaid: true,  maxDaysYear: 10, color: '#ef4444' },
    { code: 'PERSONAL', name: '事假', isPaid: false, maxDaysYear: 5,  color: '#a78bfa' },
  ]).returning().all();
  const lt = Object.fromEntries(ltRows.map(l => [l.code, l]));
  console.log('  Leave types: 3');

  // ========== 9. 排班组（2 个） ==========
  const [grpOnline] = db.insert(s.wfmGroups).values({ name: '在线组', maxStartDiffMinutes: 120, maxEndDiffMinutes: 120 }).returning().all();
  const [grpVoice]  = db.insert(s.wfmGroups).values({ name: '语音组', maxStartDiffMinutes: 240, maxEndDiffMinutes: 240 }).returning().all();

  db.insert(s.wfmGroupMembers).values([
    // 在线组：张琦、李娜、赵敏、刘洋
    { groupId: grpOnline.id, staffId: ZHANG_QI },
    { groupId: grpOnline.id, staffId: LI_NA },
    { groupId: grpOnline.id, staffId: ZHAO_MIN },
    { groupId: grpOnline.id, staffId: LIU_YANG },
    // 语音组：王蕾、马超、方琳
    { groupId: grpVoice.id, staffId: WANG_LEI },
    { groupId: grpVoice.id, staffId: MA_CHAO },
    { groupId: grpVoice.id, staffId: FANG_LIN },
  ]).run();
  console.log('  Groups: 2 (在线组 4人 / 语音组 3人)');

  // ========== 10. 技能分配 ==========
  const skillBindings = [
    // 所有人有中文语音
    ...ALL_STAFF.map(id => ({ staffId: id, skillId: sk.VOICE_CN.id, proficiency: 100 })),
    // 英文语音：李娜、方琳
    { staffId: LI_NA,    skillId: sk.VOICE_EN.id, proficiency: 90 },
    { staffId: FANG_LIN, skillId: sk.VOICE_EN.id, proficiency: 85 },
    // 在线客服：张琦、李娜、赵敏、刘洋、方琳
    { staffId: ZHANG_QI, skillId: sk.ONLINE_CHAT.id, proficiency: 90 },
    { staffId: LI_NA,    skillId: sk.ONLINE_CHAT.id, proficiency: 85 },
    { staffId: ZHAO_MIN, skillId: sk.ONLINE_CHAT.id, proficiency: 80 },
    { staffId: LIU_YANG, skillId: sk.ONLINE_CHAT.id, proficiency: 100 },
    { staffId: FANG_LIN, skillId: sk.ONLINE_CHAT.id, proficiency: 90 },
    // 邮件：方琳
    { staffId: FANG_LIN, skillId: sk.EMAIL.id, proficiency: 80 },
    // VIP：张琦、方琳
    { staffId: ZHANG_QI, skillId: sk.VIP.id, proficiency: 100 },
    { staffId: FANG_LIN, skillId: sk.VIP.id, proficiency: 75 },
    // 投诉：王蕾、赵敏、马超、方琳
    { staffId: WANG_LEI, skillId: sk.COMPLAINT.id, proficiency: 90 },
    { staffId: ZHAO_MIN, skillId: sk.COMPLAINT.id, proficiency: 80 },
    { staffId: MA_CHAO,  skillId: sk.COMPLAINT.id, proficiency: 95 },
    { staffId: FANG_LIN, skillId: sk.COMPLAINT.id, proficiency: 70 },
  ];
  db.insert(s.wfmStaffSkills).values(skillBindings).run();
  console.log(`  Staff skills: ${skillBindings.length}`);

  // ========== 11. 假勤申请（基于动态日期） ==========
  const today = new Date();
  const d0 = fmtDate(today, -1); // 昨天
  const d1 = fmtDate(today, 0);  // 今天
  const d2 = fmtDate(today, 1);  // 明天

  db.insert(s.wfmLeaves).values([
    // ── 动态日期（用于 UI 演示） ──
    // 张琦：明天年假全天（预排，已审批）
    { staffId: ZHANG_QI, leaveTypeId: lt.ANNUAL.id, startTime: `${d2}T00:00:00`, endTime: `${d2}T23:59:59`, isFullDay: true, status: 'approved', isPrePlanned: true },
    // 李娜：今天病假全天（预排，已审批）
    { staffId: LI_NA, leaveTypeId: lt.SICK.id, startTime: `${d1}T00:00:00`, endTime: `${d1}T23:59:59`, isFullDay: true, status: 'approved', isPrePlanned: true },
    // 赵敏：昨天下午半天事假（临时，已审批）
    { staffId: ZHAO_MIN, leaveTypeId: lt.PERSONAL.id, startTime: `${d0}T12:00:00`, endTime: `${d0}T16:00:00`, isFullDay: false, status: 'approved', isPrePlanned: false },
    // 马超：明天事假全天（待审批）
    { staffId: MA_CHAO, leaveTypeId: lt.PERSONAL.id, startTime: `${d2}T00:00:00`, endTime: `${d2}T23:59:59`, isFullDay: true, status: 'pending', isPrePlanned: true },
    // ── 固定日期（用于测试断言） ──
    // 李娜：04-08 病假全天
    { staffId: LI_NA, leaveTypeId: lt.SICK.id, startTime: '2026-04-08T00:00:00', endTime: '2026-04-08T23:59:59', isFullDay: true, status: 'approved', isPrePlanned: true },
  ]).run();
  console.log('  Leaves: 5');

  // ========== 12. 例外安排 ==========
  db.insert(s.wfmExceptions).values([
    // ── 动态日期 ──
    // 马超：今天 10:00-12:00 培训
    { staffId: MA_CHAO, activityId: act.TRAINING.id, startTime: `${d1}T10:00:00`, endTime: `${d1}T12:00:00`, note: '新系统培训' },
    // ── 固定日期（用于测试断言） ──
    // 马超：04-09 10:00-12:00 培训
    { staffId: MA_CHAO, activityId: act.TRAINING.id, startTime: '2026-04-09T10:00:00', endTime: '2026-04-09T12:00:00', note: '新系统培训（测试用）' },
  ]).run();
  console.log('  Exceptions: 2');

  // ========== 13. 排班计划（最近 3 天：昨天/今天/明天） ==========
  // 坐席 → 班次分配（固定排列，每人根据角色分配）
  const staffShiftMap: Record<string, typeof shMorning> = {
    [ZHANG_QI]: shMorning,
    [LI_NA]:    shMidday,
    [WANG_LEI]: shMorning,
    [ZHAO_MIN]: shMidday,
    [LIU_YANG]: shMorning,  // 兼职早班
    [MA_CHAO]:  shEvening,
    [FANG_LIN]: shFlex,     // 弹性
  };

  const dates = [d0, d1, d2];
  const [plan] = db.insert(s.wfmSchedulePlans).values({
    name: `排班计划 ${d0} ~ ${d2}`,
    startDate: d0,
    endDate: d2,
    status: 'generated',
    versionNo: 1,
  }).returning().all();

  let entryCount = 0;
  let blockCount = 0;

  for (const date of dates) {
    for (const staffId of ALL_STAFF) {
      const shift = staffShiftMap[staffId];
      const [entry] = db.insert(s.wfmScheduleEntries).values({
        planId: plan.id,
        staffId,
        date,
        shiftId: shift.id,
        status: 'editable',
      }).returning().all();
      entryCount++;

      // 根据 shift 活动模板生成 blocks
      const activities = db.select().from(s.wfmShiftActivities)
        .where(eq(s.wfmShiftActivities.shiftId, shift.id))
        .all()
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const [sh, sm] = shift.startTime.split(':').map(Number);

      for (const sa of activities) {
        const startMin = sh * 60 + sm + sa.offsetMinutes;
        const endMin = startMin + sa.durationMinutes;
        const startH = String(Math.floor(startMin / 60)).padStart(2, '0');
        const startM = String(startMin % 60).padStart(2, '0');
        const endH = String(Math.floor(endMin / 60)).padStart(2, '0');
        const endM = String(endMin % 60).padStart(2, '0');

        db.insert(s.wfmScheduleBlocks).values({
          entryId: entry.id,
          activityId: sa.activityId,
          startTime: `${date}T${startH}:${startM}:00`,
          endTime: `${date}T${endH}:${endM}:00`,
          source: 'algorithm',
          locked: false,
        }).run();
        blockCount++;
      }
    }
  }

  // 人力需求（每天 09:00-18:00 至少 3 人在线）
  for (const date of dates) {
    db.insert(s.wfmStaffingRequirements).values({
      planId: plan.id,
      date,
      startTime: `${date}T09:00:00`,
      endTime: `${date}T18:00:00`,
      minAgents: 3,
      skillId: sk.ONLINE_CHAT.id,
      channel: 'online',
    }).run();
  }

  console.log(`  Schedule plan: "${plan.name}" (${entryCount} entries, ${blockCount} blocks, 3 staffing reqs)`);

  // ========== 14. 规则定义 ==========
  const ruleDefs = db.insert(s.wfmRuleDefinitions).values([
    { code: 'LEAVE_FILTER',          name: '休假过滤',       category: 'plan',     stage: 'generate',     scopeType: 'global',   severityDefault: 'info' },
    { code: 'CONTRACT_SHIFT_AVAIL',  name: '合同班次可用性', category: 'contract', stage: 'generate',     scopeType: 'contract', severityDefault: 'error' },
    { code: 'STAFFING_MINIMUM',      name: '最低人数',       category: 'staffing', stage: 'generate',     scopeType: 'plan',     severityDefault: 'warning' },
    { code: 'SNAP_ALIGNMENT',        name: '时间吸附',       category: 'activity', stage: 'edit_preview', scopeType: 'global',   severityDefault: 'info' },
    { code: 'MIN_DURATION',          name: '最小时长',       category: 'activity', stage: 'edit_preview', scopeType: 'global',   severityDefault: 'error', paramSchema: '{"minMinutes":15}' },
    { code: 'SHIFT_BOUNDARY',        name: '班次边界',       category: 'activity', stage: 'edit_preview', scopeType: 'global',   severityDefault: 'error' },
    { code: 'ACTIVITY_COVER',        name: '活动覆盖规则',   category: 'activity', stage: 'edit_preview', scopeType: 'activity', severityDefault: 'error' },
    { code: 'CONTRACT_DAILY_HOURS',  name: '合同日工时',     category: 'contract', stage: 'edit_commit',  scopeType: 'contract', severityDefault: 'error' },
    { code: 'MEAL_REQUIRED',         name: '午餐必须',       category: 'contract', stage: 'edit_commit',  scopeType: 'contract', severityDefault: 'warning' },
    { code: 'MIN_BREAK',             name: '最小休息',       category: 'contract', stage: 'edit_commit',  scopeType: 'contract', severityDefault: 'warning' },
    { code: 'GROUP_SYNC',            name: '班组同步',       category: 'group',    stage: 'edit_commit',  scopeType: 'group',    severityDefault: 'warning' },
    { code: 'STAFFING_COVERAGE',     name: '覆盖率校验',     category: 'staffing', stage: 'edit_commit',  scopeType: 'plan',     severityDefault: 'error' },
    { code: 'WEEK_HOURS',            name: '周工时检查',     category: 'contract', stage: 'publish',      scopeType: 'contract', severityDefault: 'error' },
  ]).returning().all();
  console.log(`  Rule definitions: ${ruleDefs.length}`);

  // ========== 15. 规则绑定 + 编排 ==========
  const bindings = db.insert(s.wfmRuleBindings).values(
    ruleDefs.map(rd => ({ definitionId: rd.id, scopeType: rd.scopeType, scopeId: null, priority: 100, enabled: true, params: null })),
  ).returning().all();

  const stages = ['generate', 'edit_preview', 'edit_commit', 'publish'];
  let chainCount = 0;
  for (const stage of stages) {
    const stageBindings = bindings.filter((_, i) => ruleDefs[i].stage === stage);
    stageBindings.forEach((b, order) => {
      db.insert(s.wfmRuleChains).values({ stage, executionOrder: order + 1, bindingId: b.id, stopOnError: stage === 'publish' }).run();
      chainCount++;
    });
  }
  console.log(`  Rule bindings: ${bindings.length}, chains: ${chainCount}`);

  console.log('[wfm-seed] Seed complete!');
}

seed();
