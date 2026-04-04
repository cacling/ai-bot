/**
 * Test setup — 在所有测试前初始化隔离的临时 DB
 *
 * 流程：
 * 1. bunfig.toml preload 先执行本文件
 * 2. 设置 WFM_DB_PATH 指向 OS 临时目录下的唯一文件
 * 3. 从 shared-db schema 动态生成 DDL（含 FK 约束），消除手写 SQL 的漂移风险
 * 4. 动态 import seed.ts 写入测试基线数据
 */
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Database } from 'bun:sqlite';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import * as schema from '@ai-bot/shared-db/schema/wfm';

// ── 1. 设置隔离的 DB 路径（必须在 db.ts 被 import 之前） ───────────────────
const testDbDir = mkdtempSync(join(tmpdir(), 'wfm-test-'));
const testDbPath = join(testDbDir, 'test.db');
process.env.WFM_DB_PATH = testDbPath;

// ── 2. 从 drizzle schema 动态生成 CREATE TABLE SQL ─────────────────────────

/** 把 drizzle 表定义转为 CREATE TABLE IF NOT EXISTS 语句 */
function generateCreateTable(table: Parameters<typeof getTableConfig>[0]): string {
  const config = getTableConfig(table);
  const parts: string[] = [];

  for (const col of config.columns) {
    let def = `"${col.name}" ${col.getSQLType()}`;
    if (col.primary) {
      def += ' PRIMARY KEY';
      if (col.autoIncrement) def += ' AUTOINCREMENT';
    }
    if (col.notNull) def += ' NOT NULL';
    // 仅包含 SQL 级 DEFAULT（.default(value)），排除 JS 级 $defaultFn
    if (col.default !== undefined) {
      const d = col.default;
      if (typeof d === 'string') def += ` DEFAULT '${d}'`;
      else if (typeof d === 'number') def += ` DEFAULT ${d}`;
    }
    parts.push(def);
  }

  for (const fk of config.foreignKeys) {
    const ref = fk.reference();
    const fromCols = ref.columns.map((c: { name: string }) => `"${c.name}"`).join(', ');
    const toCols = ref.foreignColumns.map((c: { name: string }) => `"${c.name}"`).join(', ');
    const toTable = getTableConfig(ref.foreignTable).name;
    let fkDef = `FOREIGN KEY (${fromCols}) REFERENCES "${toTable}"(${toCols})`;
    if (fk.onDelete) fkDef += ` ON DELETE ${fk.onDelete.toUpperCase()}`;
    if (fk.onUpdate) fkDef += ` ON UPDATE ${fk.onUpdate.toUpperCase()}`;
    parts.push(fkDef);
  }

  return `CREATE TABLE IF NOT EXISTS "${config.name}" (\n  ${parts.join(',\n  ')}\n)`;
}

// 按依赖顺序排列（被引用的表在前）
const allTables = [
  // 主数据
  schema.wfmActivities,
  schema.wfmActivityCoverRules,
  schema.wfmSkills,
  schema.wfmShiftPatterns,
  schema.wfmShifts,
  schema.wfmShiftActivities,
  schema.wfmShiftPackages,
  schema.wfmShiftPackageItems,
  schema.wfmContracts,
  schema.wfmContractPackages,
  // 人员
  schema.wfmStaffSkills,
  schema.wfmGroups,
  schema.wfmGroupMembers,
  schema.wfmStaffContracts,
  schema.wfmLeaveTypes,
  schema.wfmLeaves,
  schema.wfmExceptions,
  // 计划
  schema.wfmSchedulePlans,
  schema.wfmScheduleEntries,
  schema.wfmScheduleBlocks,
  schema.wfmStaffingRequirements,
  schema.wfmPlanVersions,
  // 规则
  schema.wfmRuleDefinitions,
  schema.wfmRuleBindings,
  schema.wfmRuleChains,
  // 审计
  schema.wfmChangeOperations,
  schema.wfmChangeItems,
  schema.wfmValidationResults,
  schema.wfmPublishLogs,
];

const sqlite = new Database(testDbPath, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');
for (const table of allTables) {
  sqlite.exec(generateCreateTable(table));
}
sqlite.close();

// ── 3. Seed（db.ts 会读取已设置的 WFM_DB_PATH）
await import('../src/seed');

console.log(`[test-setup] Isolated WFM test DB ready: ${testDbPath}`);
