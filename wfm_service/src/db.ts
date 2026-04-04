/**
 * DB 连接 — bun:sqlite，复用 shared-db 的 wfm schema
 */
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { fileURLToPath } from 'url';
import * as wfmSchema from '@ai-bot/shared-db/schema/wfm';

const dbPath =
  process.env.WFM_DB_PATH ??
  fileURLToPath(new URL('../data/wfm.db', import.meta.url));

const sqlite = new Database(dbPath, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA busy_timeout = 5000');
sqlite.exec('PRAGMA foreign_keys = ON');

export const db = drizzle(sqlite, { schema: wfmSchema });
export { sqlite };

// ── 表 re-export ──
export const {
  // 主数据
  wfmActivities,
  wfmActivityCoverRules,
  wfmSkills,
  wfmShiftPatterns,
  wfmShifts,
  wfmShiftActivities,
  wfmShiftPackages,
  wfmShiftPackageItems,
  wfmContracts,
  wfmContractPackages,
  // 人员
  wfmStaffSkills,
  wfmGroups,
  wfmGroupMembers,
  wfmStaffContracts,
  wfmLeaveTypes,
  wfmLeaves,
  wfmExceptions,
  // 计划
  wfmSchedulePlans,
  wfmScheduleEntries,
  wfmScheduleBlocks,
  wfmStaffingRequirements,
  wfmPlanVersions,
  // 规则
  wfmRuleDefinitions,
  wfmRuleBindings,
  wfmRuleChains,
  // 审计
  wfmChangeOperations,
  wfmChangeItems,
  wfmValidationResults,
  wfmPublishLogs,
} = wfmSchema;

export { eq, and, desc, asc, sql, count, like, or, inArray } from 'drizzle-orm';
