/**
 * API tests for: src/agent/km/mcp/connectors.ts
 * Routes: GET/POST /api/mcp/connectors, GET/PUT/DELETE /:id, POST /:id/test
 * Mock: db(connectors, toolImplementations), HTTP(fetch)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/mcp/connectors', () => {
  test.skip('returns connector list', async () => {});
  test.skip('filters by type (api/remote_mcp)', async () => {});
});

describe('POST /api/mcp/connectors', () => {
  test.skip('creates API connector with base_url', async () => {});
  test.skip('creates remote_mcp connector with mcp_url', async () => {});
  test.skip('returns 400 when name is missing', async () => {});
});

describe('GET /api/mcp/connectors/:id', () => {
  test.skip('returns connector detail with implementation count', async () => {});
});

describe('PUT /api/mcp/connectors/:id', () => {
  test.skip('updates connector config', async () => {});
});

describe('DELETE /api/mcp/connectors/:id', () => {
  test.skip('deletes connector', async () => {});
});

describe('POST /api/mcp/connectors/:id/test', () => {
  test.skip('tests API connection and returns elapsed_ms', async () => {});
  test.skip('returns error message when connection fails', async () => {});
});
