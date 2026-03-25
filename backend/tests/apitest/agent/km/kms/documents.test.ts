/**
 * API tests for: src/agent/km/kms/documents.ts
 * Routes: GET/POST /api/km/documents, GET/PUT /api/km/documents/:id, POST versions, POST parse
 * Mock: db(kmDocuments, kmDocVersions, kmCandidates), fs(readFile)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/km/documents', () => {
  test.skip('returns paginated document list', async () => {});
  test.skip('supports limit/offset pagination', async () => {});
});

describe('POST /api/km/documents', () => {
  test.skip('creates document and initial version', async () => {});
  test.skip('returns 400 when title is missing', async () => {});
});

describe('GET /api/km/documents/:id', () => {
  test.skip('returns document detail with metadata', async () => {});
  test.skip('returns 404 for non-existent id', async () => {});
});

describe('PUT /api/km/documents/:id', () => {
  test.skip('updates document metadata (title, classification)', async () => {});
});

describe('POST /api/km/documents/:id/versions', () => {
  test.skip('creates new version for existing document', async () => {});
});

describe('POST /api/km/documents/versions/:vid/parse', () => {
  test.skip('triggers parse pipeline (parse→chunk→generate→validate)', async () => {});
  test.skip('supports partial stages (parse+chunk only)', async () => {});
});
