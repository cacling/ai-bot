/**
 * Playwright global setup — runs once before the test suite.
 * Re-seeds the SQLite DB to ensure each test run starts with clean data.
 * This is critical because cancel_service tool actually mutates the DB.
 */
import { execSync } from 'child_process';
import path from 'path';

export default function globalSetup() {
  const backendDir = path.resolve(__dirname, '../../../backend');
  console.log('[global-setup] Re-seeding database...');
  try {
    execSync('bun run db:seed', { cwd: backendDir, stdio: 'pipe' });
    console.log('[global-setup] Database seeded successfully');
  } catch (err) {
    console.error('[global-setup] Failed to seed database:', err);
    // Don't throw — tests can still run with stale data
  }
}
