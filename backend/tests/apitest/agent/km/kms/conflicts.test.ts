/**
 * API tests for: src/agent/km/kms/conflicts.ts
 * Routes: GET/POST /api/km/conflicts, GET /api/km/conflicts/:id, PUT /api/km/conflicts/:id/resolve
 * Mock: db(kmConflictRecords), audit(writeAudit)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/km/conflicts', () => {
  test.skip('returns conflict list', async () => {});
  test.skip('filters by status (pending/resolved)', async () => {});
});

describe('POST /api/km/conflicts', () => {
  test.skip('creates conflict record with type and blocking_strategy', async () => {});
  test.skip('supports types: wording/scope/version/replacement', async () => {});
});

describe('GET /api/km/conflicts/:id', () => {
  test.skip('returns conflict detail', async () => {});
});

describe('PUT /api/km/conflicts/:id/resolve', () => {
  test.skip('resolves with resolution: keep_a/keep_b/coexist/split', async () => {});
  test.skip('writes audit log on resolution', async () => {});
});
