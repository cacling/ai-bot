import type { Adapter, AdapterCallContext, AdapterType } from '../types';
import { isErrorResult, isNoDataResult } from '../../services/tool-result';
import { logger } from '../../services/logger';

const KM_BASE = process.env.KM_SERVICE_URL ?? `http://localhost:${process.env.KM_SERVICE_PORT ?? 18010}`;

interface DbQueryConfig {
  table: string;
  operation: 'select' | 'insert' | 'update';
  where?: Record<string, string>;
  columns?: string[];
  set?: Record<string, string>;
  values?: Record<string, string>;
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
    if (config.operation !== 'select') {
      throw new Error(`DB operation "${config.operation}" not yet implemented`);
    }

    const resolveValue = (template: string): unknown => {
      const match = template.match(/^\{\{(\w+)\}\}$/);
      if (match) return args[match[1]];
      return template;
    };

    const where: Record<string, unknown> = {};
    if (config.where) {
      for (const [col, tmpl] of Object.entries(config.where)) {
        where[col] = resolveValue(tmpl);
      }
    }

    // Call km_service internal DB query proxy
    const res = await fetch(`${KM_BASE}/api/internal/db/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: config.table,
        columns: config.columns,
        where,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`km_service query failed: ${JSON.stringify(err)}`);
    }

    const data = await res.json() as { rows: unknown[] };
    return data.rows;
  }
}
