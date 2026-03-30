/**
 * Playwright global setup — runs once before the test suite.
 * Re-seeds the SQLite DB to ensure each test run starts with clean data.
 * This is critical because cancel_service tool actually mutates the DB.
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function globalSetup() {
  // Ensure E2E tests don't route localhost requests through a proxy
  // (proxy may be dead but env vars remain, causing connection timeouts)
  process.env.NO_PROXY = (process.env.NO_PROXY ?? '') + ',127.0.0.1,localhost';

  if (process.env.PLAYWRIGHT_SKIP_GLOBAL_SEED === '1') {
    console.log('[global-setup] Skipping DB seed because PLAYWRIGHT_SKIP_GLOBAL_SEED=1');
    return;
  }

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
