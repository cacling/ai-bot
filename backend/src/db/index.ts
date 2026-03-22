import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { fileURLToPath } from 'url';
import * as schema from './schema';

const dbPath =
  process.env.SQLITE_PATH ??
  fileURLToPath(new URL('../../../../data/telecom.db', import.meta.url));

// WAL 模式：允许后端（Bun）与 MCP Server（Node.js）并发读写同一文件
const sqlite = new Database(dbPath, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
export { sqlite };
