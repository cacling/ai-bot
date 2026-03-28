import type { Adapter, AdapterCallContext, AdapterType } from '../types';
import { db } from '../../db';
import { isErrorResult, isNoDataResult } from '../../services/tool-result';
import { logger } from '../../services/logger';

interface DbQueryConfig {
  table: string;
  operation: 'select' | 'insert' | 'update';
  where?: Record<string, string>;
  columns?: string[];
  set?: Record<string, string>;
  values?: Record<string, string>;
}

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertSafeIdentifier(name: string, label: string): void {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Unsafe ${label}: "${name}" — only alphanumeric and underscore allowed`);
  }
}

export class DbAdapter implements Adapter {
  type: AdapterType = 'db';

  async call(ctx: AdapterCallContext): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    const { toolName, args } = ctx.request;
    const bindingConfig = ctx.resolved.binding?.config as Record<string, unknown> | undefined;
    const dbConfig = bindingConfig?.db as DbQueryConfig | undefined;

    if (!dbConfig) {
      return { rawText: `No DB query config for tool "${toolName}"`, parsed: null, success: false, hasData: false };
    }

    try {
      const result = await this.executeQuery(dbConfig, args as Record<string, unknown>);
      const text = JSON.stringify(result);
      const success = !isErrorResult(text);
      const hasData = success && !isNoDataResult(text) && (Array.isArray(result) ? result.length > 0 : result !== null);

      logger.info('db-adapter', 'executed', { tool: toolName, table: dbConfig.table, op: dbConfig.operation, hasData });
      return { rawText: text, parsed: result, success, hasData };
    } catch (err) {
      logger.error('db-adapter', 'error', { tool: toolName, error: String(err) });
      return { rawText: `DB query failed: ${String(err)}`, parsed: null, success: false, hasData: false };
    }
  }

  private async executeQuery(config: DbQueryConfig, args: Record<string, unknown>): Promise<unknown> {
    assertSafeIdentifier(config.table, 'table name');
    if (config.columns) {
      for (const col of config.columns) assertSafeIdentifier(col, 'column name');
    }

    const resolveValue = (template: string): unknown => {
      const match = template.match(/^\{\{(\w+)\}\}$/);
      if (match) return args[match[1]];
      return template;
    };

    if (config.operation === 'select') {
      const cols = config.columns?.join(', ') ?? '*';

      const conditions: string[] = [];
      const params: unknown[] = [];
      if (config.where) {
        for (const [col, tmpl] of Object.entries(config.where)) {
          assertSafeIdentifier(col, 'where column');
          conditions.push(`${col} = ?`);
          params.push(resolveValue(tmpl));
        }
      }
      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
      const query = `SELECT ${cols} FROM ${config.table}${whereClause}`;

      const stmt = db.$client.prepare(query);
      return stmt.all(...params);
    }

    throw new Error(`DB operation "${config.operation}" not yet implemented`);
  }
}
