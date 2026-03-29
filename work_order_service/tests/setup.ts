/**
 * Test setup — 在所有测试前初始化隔离的临时 DB
 *
 * 流程：
 * 1. bunfig.toml preload 先执行本文件
 * 2. 设置 SQLITE_PATH 指向 OS 临时目录下的唯一文件
 * 3. 从 shared-db schema 动态生成 DDL（含 FK 约束），消除手写 SQL 的漂移风险
 * 4. 动态 import seed.ts 写入测试基线数据
 */
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createClient } from "@libsql/client";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "@ai-bot/shared-db/schema/workorder";

// ── 1. 设置隔离的 DB 路径（必须在 db.ts 被 import 之前） ───────────────────
const testDbDir = mkdtempSync(join(tmpdir(), "wo-test-"));
const testDbPath = join(testDbDir, "test.db");
process.env.SQLITE_PATH = testDbPath;

// ── 2. 从 drizzle schema 动态生成 CREATE TABLE SQL ─────────────────────────

/** 把 drizzle 表定义转为 CREATE TABLE IF NOT EXISTS 语句 */
function generateCreateTable(table: Parameters<typeof getTableConfig>[0]): string {
  const config = getTableConfig(table);
  const parts: string[] = [];

  for (const col of config.columns) {
    let def = `"${col.name}" ${col.getSQLType()}`;
    if (col.primary) {
      def += " PRIMARY KEY";
      if (col.autoIncrement) def += " AUTOINCREMENT";
    }
    if (col.notNull) def += " NOT NULL";
    // 仅包含 SQL 级 DEFAULT（.default(value)），排除 JS 级 $defaultFn
    if (col.default !== undefined) {
      const d = col.default;
      if (typeof d === "string") def += ` DEFAULT '${d}'`;
      else if (typeof d === "number") def += ` DEFAULT ${d}`;
    }
    parts.push(def);
  }

  for (const fk of config.foreignKeys) {
    const ref = fk.reference();
    const fromCols = ref.columns.map((c: { name: string }) => `"${c.name}"`).join(", ");
    const toCols = ref.foreignColumns.map((c: { name: string }) => `"${c.name}"`).join(", ");
    const toTable = getTableConfig(ref.foreignTable).name;
    let fkDef = `FOREIGN KEY (${fromCols}) REFERENCES "${toTable}"(${toCols})`;
    if (fk.onDelete) fkDef += ` ON DELETE ${fk.onDelete.toUpperCase()}`;
    if (fk.onUpdate) fkDef += ` ON UPDATE ${fk.onUpdate.toUpperCase()}`;
    parts.push(fkDef);
  }

  return `CREATE TABLE IF NOT EXISTS "${config.name}" (\n  ${parts.join(",\n  ")}\n)`;
}

// 按依赖顺序排列（被引用的表在前）
const allTables = [
  schema.workItems,
  schema.workOrders,
  schema.appointments,
  schema.tickets,
  schema.tasks,
  schema.workItemEvents,
  schema.workItemRelations,
  schema.workItemTemplates,
  schema.workQueues,
  schema.workItemCategories,
  schema.workflowDefinitions,
  schema.workflowRuns,
  schema.workflowRunEvents,
  schema.workItemIntakes,
  schema.workItemDrafts,
  schema.issueThreads,
  schema.issueMergeReviews,
];

const client = createClient({ url: `file:${testDbPath}` });
await client.execute("PRAGMA foreign_keys = ON");
for (const table of allTables) {
  await client.execute(generateCreateTable(table));
}
client.close();

// ── 3. Seed（db.ts 会读取已设置的 SQLITE_PATH，seed 中的顶层 await 保证数据写入完成）
await import("../src/seed.js");

console.log(`[test-setup] Isolated test DB ready: ${testDbPath}`);
