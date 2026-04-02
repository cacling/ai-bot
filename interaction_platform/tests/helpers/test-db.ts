/**
 * test-db.ts — Shared test database setup.
 *
 * All test files share a single SQLite DB because db.ts creates a module-level
 * singleton connection. Each test file uses unique IDs to avoid collisions.
 * Schema is pushed once (first call); subsequent calls are no-ops.
 */
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { $ } from 'bun';

const ROOT_DIR = join(import.meta.dir, '../..');
const DB_PATH = join(import.meta.dir, '../.test-shared.db');

let schemaPushed = false;

// Set env before any db import — must happen at module load time
for (const suffix of ['', '-wal', '-shm']) {
  const f = DB_PATH + suffix;
  if (existsSync(f)) unlinkSync(f);
}
process.env.INTERACTION_DB_PATH = DB_PATH;

/**
 * Initialize a test DB. The `name` parameter is kept for API compat but all
 * test files share the same underlying DB + connection.
 */
export function initTestDb(_name: string) {
  return {
    dbPath: DB_PATH,
    async pushSchema() {
      if (schemaPushed) return;
      schemaPushed = true;
      await $`cd ${ROOT_DIR} && INTERACTION_DB_PATH=${DB_PATH} bun --bun x drizzle-kit push --force`.quiet();
    },
    cleanup() {
      // No-op: shared DB is cleaned up at module load (start of test run).
      // Individual file cleanup would break other files still running.
    },
  };
}
