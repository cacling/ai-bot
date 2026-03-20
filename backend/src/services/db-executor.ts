/**
 * db-executor.ts — DB 类型 MCP 工具的 SQL 执行器
 *
 * 根据 execution_config.db 配置，动态构建并执行 SQL 查询/更新。
 * V1 只支持本地应用数据库（SQLite via drizzle）。
 */

import { db as appDb } from '../db';
import { logger } from './logger';
import Database from 'bun:sqlite';

// 获取底层 SQLite 连接（drizzle 不暴露原生 query，需要直接用 bun:sqlite）
const sqlite = (appDb as any).$client as Database;

export interface DbExecutionConfig {
  table: string;
  operation: 'select_one' | 'select_many' | 'update_one';
  where: Array<{ param: string; column: string; op: string }>;
  columns?: string[];
  // update_one 专用
  set_columns?: Array<{ param: string; column: string }>;
  set_fixed?: Record<string, unknown>;
}

export interface DbExecutionResult {
  success: boolean;
  rows?: Record<string, unknown>[];
  count?: number;
  message?: string;
  affected_rows?: number;
}

/**
 * 根据 DB 配置执行查询/更新，返回结构化结果。
 * 所有参数通过占位符绑定，防 SQL 注入。
 */
export function executeDbTool(
  config: DbExecutionConfig,
  args: Record<string, unknown>,
): DbExecutionResult {
  try {
    // 校验表名（只允许字母数字下划线，防注入）
    if (!/^[a-zA-Z_]\w*$/.test(config.table)) {
      return { success: false, message: `非法表名: ${config.table}` };
    }

    // 构建 WHERE 子句
    const whereParts: string[] = [];
    const whereValues: unknown[] = [];
    for (const w of config.where) {
      if (!/^[a-zA-Z_]\w*$/.test(w.column)) {
        return { success: false, message: `非法列名: ${w.column}` };
      }
      const op = w.op === '=' ? '=' : w.op === '!=' ? '!=' : w.op === 'LIKE' ? 'LIKE' : '=';
      whereParts.push(`${w.column} ${op} ?`);
      whereValues.push(args[w.param] ?? null);
    }
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    if (config.operation === 'select_one' || config.operation === 'select_many') {
      // 校验列名
      const cols = config.columns && config.columns.length > 0
        ? config.columns.map(c => {
            if (!/^[a-zA-Z_]\w*$/.test(c)) throw new Error(`非法列名: ${c}`);
            return c;
          }).join(', ')
        : '*';

      const limit = config.operation === 'select_one' ? 'LIMIT 1' : '';
      const sql = `SELECT ${cols} FROM ${config.table} ${whereClause} ${limit}`.trim();

      logger.info('db-executor', 'query', { sql, params: whereValues });
      const rows = sqlite.prepare(sql).all(...whereValues) as Record<string, unknown>[];

      if (config.operation === 'select_one') {
        if (rows.length === 0) {
          return { success: false, rows: [], count: 0, message: '未找到匹配记录' };
        }
        return { success: true, rows, count: 1 };
      }
      return { success: true, rows, count: rows.length };

    } else if (config.operation === 'update_one') {
      const setParts: string[] = [];
      const setValues: unknown[] = [];

      // 从参数映射
      for (const s of config.set_columns ?? []) {
        if (!/^[a-zA-Z_]\w*$/.test(s.column)) {
          return { success: false, message: `非法列名: ${s.column}` };
        }
        setParts.push(`${s.column} = ?`);
        setValues.push(args[s.param] ?? null);
      }
      // 固定值
      for (const [col, val] of Object.entries(config.set_fixed ?? {})) {
        if (!/^[a-zA-Z_]\w*$/.test(col)) {
          return { success: false, message: `非法列名: ${col}` };
        }
        setParts.push(`${col} = ?`);
        setValues.push(val);
      }

      if (setParts.length === 0) {
        return { success: false, message: '没有指定要更新的字段' };
      }

      const sql = `UPDATE ${config.table} SET ${setParts.join(', ')} ${whereClause}`.trim();
      const allValues = [...setValues, ...whereValues];

      logger.info('db-executor', 'update', { sql, params: allValues });
      const result = sqlite.prepare(sql).run(...allValues);
      const affected = result.changes;

      if (affected === 0) {
        return { success: false, affected_rows: 0, message: '未找到匹配记录，未更新' };
      }
      return { success: true, affected_rows: affected, message: `更新成功，影响 ${affected} 行` };
    }

    return { success: false, message: `不支持的操作类型: ${config.operation}` };
  } catch (err) {
    logger.error('db-executor', 'execute_error', { error: String(err), table: config.table });
    return { success: false, message: `执行失败: ${String(err)}` };
  }
}

/**
 * 获取本地数据库的所有表名（供前端下拉选择）
 */
export function listTables(): string[] {
  try {
    const rows = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__%' ORDER BY name").all() as Array<{ name: string }>;
    return rows.map(r => r.name);
  } catch { return []; }
}

/**
 * 获取指定表的列名列表（供前端勾选返回字段）
 */
export function listColumns(tableName: string): Array<{ name: string; type: string }> {
  if (!/^[a-zA-Z_]\w*$/.test(tableName)) return [];
  try {
    const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string; type: string }>;
    return rows.map(r => ({ name: r.name, type: r.type }));
  } catch { return []; }
}
