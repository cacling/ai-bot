/**
 * DB 连接 — bun:sqlite，复用 shared-db 的 outbound schema
 */
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { fileURLToPath } from 'url';
import * as outboundSchema from '@ai-bot/shared-db/schema/outbound';

const dbPath =
  process.env.OUTBOUND_DB_PATH ??
  fileURLToPath(new URL('../data/outbound.db', import.meta.url));

const sqlite = new Database(dbPath, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA busy_timeout = 5000');

export const db = drizzle(sqlite, { schema: outboundSchema });
export { sqlite };

// ── 表 re-export ──
export const {
  obCampaigns,
  obTasks,
  obCallResults,
  obSmsEvents,
  obHandoffCases,
  obMarketingResults,
  obCallbackTasks,
  obTestPersonas,
} = outboundSchema;

export { eq, and, desc, asc, sql, count, like, or, inArray } from 'drizzle-orm';
