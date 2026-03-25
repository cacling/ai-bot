/**
 * API tests for: src/agent/km/kms/candidates.ts
 * Routes: GET/POST /api/km/candidates, GET/PUT /api/km/candidates/:id, POST gate-check
 * Mock: db(kmCandidates, kmEvidenceRefs, kmConflictRecords)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/km/candidates', () => {
  test.skip('returns candidate list', async () => {});
  test.skip('filters by status (draft/gate_pass/in_review/published)', async () => {});
  test.skip('filters by source_type', async () => {});
});

describe('POST /api/km/candidates', () => {
  test.skip('creates candidate with source_type=manual', async () => {});
  test.skip('returns 400 when normalized_q is missing', async () => {});
});

describe('GET /api/km/candidates/:id', () => {
  test.skip('returns candidate with evidence and conflict records', async () => {});
  test.skip('returns 404 for non-existent id', async () => {});
});

describe('PUT /api/km/candidates/:id', () => {
  test.skip('updates scene_code, variants_json, structured_json', async () => {});
});

describe('POST /api/km/candidates/:id/gate-check', () => {
  test.skip('evidence gate fails when no pass evidence exists', async () => {});
  test.skip('conflict gate fails when pending blocking conflict exists', async () => {});
  test.skip('ownership gate fails when no target asset linked', async () => {});
  test.skip('all three gates pass → status becomes gate_pass', async () => {});
});
