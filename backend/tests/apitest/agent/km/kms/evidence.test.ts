/**
 * API tests for: src/agent/km/kms/evidence.ts
 * Routes: GET/POST /api/km/evidence, PUT /api/km/evidence/:id
 * Mock: db(kmEvidenceRefs), audit(writeAudit)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/km/evidence', () => {
  test.skip('returns evidence list filtered by candidate_id', async () => {});
});

describe('POST /api/km/evidence', () => {
  test.skip('creates evidence reference linking candidate to document', async () => {});
  test.skip('returns 400 when candidate_id is missing', async () => {});
});

describe('PUT /api/km/evidence/:id', () => {
  test.skip('updates evidence status to pass', async () => {});
  test.skip('updates evidence status to fail', async () => {});
  test.skip('writes audit log on status change', async () => {});
});
