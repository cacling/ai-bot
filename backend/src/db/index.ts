import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { fileURLToPath } from 'url';
import * as schema from './schema';

// ── km.db（平台+知识管理表，与 km_service 共享，Phase 2.4 后由 km_service 独占）──
const dbPath =
  process.env.SQLITE_PATH ??
  fileURLToPath(new URL('../../../data/km.db', import.meta.url));

const sqlite = new Database(dbPath, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export { sqlite };

// ── platform.db（backend 独占的运行时表：sessions, messages, staff, skill_instances 等）──
const platformDbPath =
  process.env.PLATFORM_DB_PATH ??
  fileURLToPath(new URL('../../../data/platform.db', import.meta.url));

const platformSqlite = new Database(platformDbPath, { create: true });
platformSqlite.exec('PRAGMA journal_mode = WAL');
platformSqlite.exec('PRAGMA busy_timeout = 5000');

export const platformDb = drizzle(platformSqlite, { schema });
export { platformSqlite };

// ── business.db（只读，查询用户信息用于个性化问候等）──
const businessDbPath =
  process.env.BUSINESS_DB_PATH ??
  fileURLToPath(new URL('../../../data/business.db', import.meta.url));

const businessSqlite = new Database(businessDbPath, { readonly: true });
export const businessDb = drizzle(businessSqlite, { schema });
