import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { fileURLToPath } from 'url';
import * as schema from './schema';

// ── platform.db（backend 独占的运行时表：sessions, messages, staff, skill_instances 等）──
const platformDbPath =
  process.env.PLATFORM_DB_PATH ??
  fileURLToPath(new URL('../../data/platform.db', import.meta.url));

const platformSqlite = new Database(platformDbPath, { create: true });
platformSqlite.exec('PRAGMA journal_mode = WAL');
platformSqlite.exec('PRAGMA busy_timeout = 5000');

export const platformDb = drizzle(platformSqlite, { schema });
export { platformSqlite };

// seed.ts 兼容别名（原 db 指向 platform.db，迁移过渡期保留）
export const db = platformDb;
export const sqlite = platformSqlite;

// ── 其他数据库已按 Constitution XII 迁移 ──
// km.db → km_service（通过 km-client.ts HTTP API 访问）
// business.db → mock_apis（通过 MCP tools 访问）
// cdp.db → cdp_service（通过 cdp-client.ts HTTP API 访问）
