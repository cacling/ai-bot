/**
 * API tests for: src/agent/km/skills/skills.ts
 * Routes: GET /api/skills, GET /api/skills/:id/files, DELETE /api/skills/:id
 * Mock: fs(readdir), db(skillRegistry, skillVersions)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/skills', () => {
  test.skip('returns skill list with metadata from registry', async () => {});
  test.skip('each skill has id, name, description, version, channels', async () => {});
});

describe('GET /api/skills/:id/files', () => {
  test.skip('returns file tree for existing skill', async () => {});
  test.skip('returns 404 for non-existent skill', async () => {});
});

describe('DELETE /api/skills/:id', () => {
  test.skip('deletes skill directory and registry entry', async () => {});
  test.skip('returns 404 for non-existent skill', async () => {});
});
