/**
 * wfm.ts — WFM 排班管理系统 Schema（Drizzle ORM + SQLite）
 *
 * 共 29 张表，分五个子域：
 *
 * 一、主数据配置（11 表）
 *   wfm_activities, wfm_activity_cover_rules, wfm_skills, wfm_shift_patterns,
 *   wfm_shifts, wfm_shift_activities, wfm_shift_packages, wfm_shift_package_items,
 *   wfm_contracts, wfm_contract_packages, wfm_staff_skills
 *
 * 二、人员与排班组（5 表）
 *   wfm_groups, wfm_group_members, wfm_staff_contracts, wfm_leave_types, wfm_leaves, wfm_exceptions
 *
 * 三、排班计划（5 表）
 *   wfm_schedule_plans, wfm_schedule_entries, wfm_schedule_blocks,
 *   wfm_staffing_requirements, wfm_plan_versions
 *
 * 四、规则中心（3 表）
 *   wfm_rule_definitions, wfm_rule_bindings, wfm_rule_chains
 *
 * 五、编辑事务与审计（4 表）
 *   wfm_change_operations, wfm_change_items, wfm_validation_results, wfm_publish_logs
 *
 * 注：所有 staff_id 列关联 staff_accounts(id)，但因跨库不设 FK 约束。
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

const ts = () => text('created_at').notNull().$defaultFn(() => new Date().toISOString());

// ===========================================================
// 一、主数据配置
// ===========================================================

/** 活动类型（Work/Break/Lunch/Meeting/Training...） */
export const wfmActivities = sqliteTable('wfm_activities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#4ade80'),
  icon: text('icon'),
  priority: integer('priority').notNull().default(0),
  isPaid: integer('is_paid', { mode: 'boolean' }).notNull().default(true),
  isCoverable: integer('is_coverable', { mode: 'boolean' }).notNull().default(true),
  canCover: integer('can_cover', { mode: 'boolean' }).notNull().default(false),
  createdAt: ts(),
});

/** 活动覆盖规则（source 能否覆盖 target） */
export const wfmActivityCoverRules = sqliteTable('wfm_activity_cover_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceActivityId: integer('source_activity_id').notNull().references(() => wfmActivities.id),
  targetActivityId: integer('target_activity_id').notNull().references(() => wfmActivities.id),
  canCover: integer('can_cover', { mode: 'boolean' }).notNull().default(false),
});

/** 技能定义（WFM 渠道能力） */
export const wfmSkills = sqliteTable('wfm_skills', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  createdAt: ts(),
});

/** 班制/班次模板 */
export const wfmShiftPatterns = sqliteTable('wfm_shift_patterns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: ts(),
});

/** 具体班次 */
export const wfmShifts = sqliteTable('wfm_shifts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  patternId: integer('pattern_id').references(() => wfmShiftPatterns.id),
  name: text('name').notNull(),
  startTime: text('start_time').notNull(),       // HH:mm
  endTime: text('end_time').notNull(),           // HH:mm
  durationMinutes: integer('duration_minutes').notNull(),
  createdAt: ts(),
});

/** 班次内活动模板（Work→Break→Work→Lunch→Work→Break→Work） */
export const wfmShiftActivities = sqliteTable('wfm_shift_activities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  shiftId: integer('shift_id').notNull().references(() => wfmShifts.id),
  activityId: integer('activity_id').notNull().references(() => wfmActivities.id),
  offsetMinutes: integer('offset_minutes').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

/** 班次包（一组可分配的班次） */
export const wfmShiftPackages = sqliteTable('wfm_shift_packages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: ts(),
});

/** 班次包 ↔ 班次关联 */
export const wfmShiftPackageItems = sqliteTable('wfm_shift_package_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  packageId: integer('package_id').notNull().references(() => wfmShiftPackages.id),
  shiftId: integer('shift_id').notNull().references(() => wfmShifts.id),
});

/** 合同（排班约束集） */
export const wfmContracts = sqliteTable('wfm_contracts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  minHoursDay: real('min_hours_day').notNull().default(4),
  maxHoursDay: real('max_hours_day').notNull().default(10),
  minHoursWeek: real('min_hours_week').notNull().default(20),
  maxHoursWeek: real('max_hours_week').notNull().default(40),
  minBreakMinutes: integer('min_break_minutes').notNull().default(15),
  lunchRequired: integer('lunch_required', { mode: 'boolean' }).notNull().default(true),
  lunchMinMinutes: integer('lunch_min_minutes').notNull().default(30),
  createdAt: ts(),
});

/** 合同 ↔ 班次包关联 */
export const wfmContractPackages = sqliteTable('wfm_contract_packages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contractId: integer('contract_id').notNull().references(() => wfmContracts.id),
  packageId: integer('package_id').notNull().references(() => wfmShiftPackages.id),
});

// ===========================================================
// 二、人员与排班组
// ===========================================================

/** 坐席 WFM 技能绑定（staff_id → staff_accounts.id） */
export const wfmStaffSkills = sqliteTable('wfm_staff_skills', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  staffId: text('staff_id').notNull(),
  skillId: integer('skill_id').notNull().references(() => wfmSkills.id),
  proficiency: integer('proficiency').notNull().default(100), // 0-100
});

/** 排班组 */
export const wfmGroups = sqliteTable('wfm_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  maxStartDiffMinutes: integer('max_start_diff_minutes').default(30),
  maxEndDiffMinutes: integer('max_end_diff_minutes').default(30),
  createdAt: ts(),
});

/** 排班组成员（staff_id → staff_accounts.id） */
export const wfmGroupMembers = sqliteTable('wfm_group_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: integer('group_id').notNull().references(() => wfmGroups.id),
  staffId: text('staff_id').notNull(),
});

/** 坐席合同绑定（staff_id → staff_accounts.id） */
export const wfmStaffContracts = sqliteTable('wfm_staff_contracts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  staffId: text('staff_id').notNull(),
  contractId: integer('contract_id').notNull().references(() => wfmContracts.id),
});

/** 假勤类型 */
export const wfmLeaveTypes = sqliteTable('wfm_leave_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  isPaid: integer('is_paid', { mode: 'boolean' }).notNull().default(true),
  maxDaysYear: integer('max_days_year'),
  color: text('color').default('#9ca3af'),
  createdAt: ts(),
});

/** 假勤申请（staff_id → staff_accounts.id） */
export const wfmLeaves = sqliteTable('wfm_leaves', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  staffId: text('staff_id').notNull(),
  leaveTypeId: integer('leave_type_id').references(() => wfmLeaveTypes.id),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  isFullDay: integer('is_full_day', { mode: 'boolean' }).notNull().default(true),
  status: text('status').notNull().default('pending'),  // pending / approved / rejected
  isPrePlanned: integer('is_pre_planned', { mode: 'boolean' }).notNull().default(true),
  note: text('note'),
  approvedBy: text('approved_by'),
  approvedAt: text('approved_at'),
  createdAt: ts(),
});

/** 例外安排（staff_id → staff_accounts.id） */
export const wfmExceptions = sqliteTable('wfm_exceptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  staffId: text('staff_id').notNull(),
  activityId: integer('activity_id').notNull().references(() => wfmActivities.id),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  note: text('note'),
  createdAt: ts(),
});

// ===========================================================
// 三、排班计划
// ===========================================================

/** 排班方案 */
export const wfmSchedulePlans = sqliteTable('wfm_schedule_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  startDate: text('start_date').notNull(),       // YYYY-MM-DD
  endDate: text('end_date').notNull(),           // YYYY-MM-DD
  status: text('status').notNull().default('draft'),  // draft / generated / editing / published / archived
  versionNo: integer('version_no').notNull().default(1),
  publishedAt: text('published_at'),
  publishedBy: text('published_by'),
  createdAt: ts(),
});

/** 排班条目（坐席某天分配，staff_id → staff_accounts.id） */
export const wfmScheduleEntries = sqliteTable('wfm_schedule_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  planId: integer('plan_id').notNull().references(() => wfmSchedulePlans.id),
  staffId: text('staff_id').notNull(),
  date: text('date').notNull(),                  // YYYY-MM-DD
  shiftId: integer('shift_id').references(() => wfmShifts.id),
  status: text('status').notNull().default('editable'), // editable / locked / published
});

/** 排班活动块 */
export const wfmScheduleBlocks = sqliteTable('wfm_schedule_blocks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entryId: integer('entry_id').notNull().references(() => wfmScheduleEntries.id),
  activityId: integer('activity_id').notNull().references(() => wfmActivities.id),
  startTime: text('start_time').notNull(),       // ISO datetime
  endTime: text('end_time').notNull(),           // ISO datetime
  source: text('source').notNull().default('algorithm'), // algorithm / manual / leave / exception
  locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
});

/** 人力覆盖需求 */
export const wfmStaffingRequirements = sqliteTable('wfm_staffing_requirements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  planId: integer('plan_id').notNull().references(() => wfmSchedulePlans.id),
  date: text('date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  minAgents: integer('min_agents').notNull(),
  skillId: integer('skill_id').references(() => wfmSkills.id),
  channel: text('channel'),
});

/** 方案版本快照 */
export const wfmPlanVersions = sqliteTable('wfm_plan_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  planId: integer('plan_id').notNull().references(() => wfmSchedulePlans.id),
  versionNo: integer('version_no').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  createdAt: ts(),
});

// ===========================================================
// 四、规则中心
// ===========================================================

/** 规则定义 */
export const wfmRuleDefinitions = sqliteTable('wfm_rule_definitions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),          // activity / contract / group / staffing / plan
  stage: text('stage').notNull(),                // generate / edit_preview / edit_commit / publish
  scopeType: text('scope_type').notNull(),       // global / activity / contract / group / plan
  severityDefault: text('severity_default').notNull().default('error'),
  paramSchema: text('param_schema'),
  description: text('description'),
  createdAt: ts(),
});

/** 规则绑定 */
export const wfmRuleBindings = sqliteTable('wfm_rule_bindings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  definitionId: integer('definition_id').notNull().references(() => wfmRuleDefinitions.id),
  scopeType: text('scope_type').notNull(),
  scopeId: integer('scope_id'),
  priority: integer('priority').notNull().default(100),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  params: text('params'),
  effectiveStart: text('effective_start'),
  effectiveEnd: text('effective_end'),
  createdAt: ts(),
});

/** 规则编排 */
export const wfmRuleChains = sqliteTable('wfm_rule_chains', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  stage: text('stage').notNull(),
  executionOrder: integer('execution_order').notNull(),
  bindingId: integer('binding_id').notNull().references(() => wfmRuleBindings.id),
  stopOnError: integer('stop_on_error', { mode: 'boolean' }).notNull().default(false),
});

// ===========================================================
// 五、编辑事务与审计
// ===========================================================

/** 变更操作 */
export const wfmChangeOperations = sqliteTable('wfm_change_operations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  planId: integer('plan_id').notNull().references(() => wfmSchedulePlans.id),
  operatorId: text('operator_id'),
  operatorName: text('operator_name'),
  intentType: text('intent_type').notNull(),
  saveMode: text('save_mode').notNull().default('commit'),
  status: text('status').notNull().default('created'),
  clientRequestId: text('client_request_id'),
  versionNo: integer('version_no'),
  createdAt: ts(),
});

/** 变更明细 */
export const wfmChangeItems = sqliteTable('wfm_change_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  operationId: integer('operation_id').notNull().references(() => wfmChangeOperations.id),
  assignmentId: integer('assignment_id'),
  blockId: integer('block_id'),
  changeType: text('change_type').notNull(),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
});

/** 校验结果 */
export const wfmValidationResults = sqliteTable('wfm_validation_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  operationId: integer('operation_id').references(() => wfmChangeOperations.id),
  planId: integer('plan_id').notNull().references(() => wfmSchedulePlans.id),
  staffId: text('staff_id'),
  date: text('date'),
  level: text('level').notNull(),
  ruleCode: text('rule_code').notNull(),
  message: text('message').notNull(),
  targetType: text('target_type'),
  targetId: integer('target_id'),
  timeRange: text('time_range'),
  confirmable: integer('confirmable', { mode: 'boolean' }).notNull().default(false),
  createdAt: ts(),
});

/** 发布记录 */
export const wfmPublishLogs = sqliteTable('wfm_publish_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  planId: integer('plan_id').notNull().references(() => wfmSchedulePlans.id),
  versionNo: integer('version_no').notNull(),
  operatorId: text('operator_id'),
  operatorName: text('operator_name'),
  action: text('action').notNull(),
  note: text('note'),
  createdAt: ts(),
});
