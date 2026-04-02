import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

const DB_PATH = process.env.CHANNEL_HOST_DB_PATH ?? './data/channel-host.db';

const sqlite = new Database(DB_PATH, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL;');

export const db = drizzle(sqlite, { schema });

/**
 * Create tables if they don't exist. Uses raw SQL since we're not using
 * drizzle-kit push in production — just direct DDL for simplicity.
 */
export function migrateDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS channel_host_plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '0.0.0',
      source TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      install_status TEXT NOT NULL DEFAULT 'installed',
      installed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_host_enablement (
      plugin_id TEXT PRIMARY KEY REFERENCES channel_host_plugins(id),
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_host_accounts (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL REFERENCES channel_host_plugins(id),
      channel_id TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      secret_ref TEXT,
      status TEXT NOT NULL DEFAULT 'created',
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS channel_host_diagnostics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_id TEXT NOT NULL,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      details_json TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_host_bridge_traces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      channel_account_id TEXT,
      event_type TEXT NOT NULL,
      payload_summary TEXT,
      result TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  console.log('[channel-host] database migrated');
}
