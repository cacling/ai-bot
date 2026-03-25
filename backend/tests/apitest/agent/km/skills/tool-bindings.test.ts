/**
 * API tests for: src/agent/km/skills/tool-bindings.ts
 * Routes: GET/PUT /api/skills/:id/tool-bindings, POST /api/skills/:id/sync-bindings
 * Mock: db(skillToolBindings), fs(readFileSync)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/skills/:id/tool-bindings', () => {
  test.skip('returns bindings array for skill', async () => {});
  test.skip('returns empty array for skill with no bindings', async () => {});
});

describe('PUT /api/skills/:id/tool-bindings', () => {
  test.skip('updates bindings list and returns ok', async () => {});
});

describe('POST /api/skills/:id/sync-bindings', () => {
  test.skip('parses SKILL.md %% tool: annotations and syncs to db', async () => {});
  test.skip('returns added/removed counts', async () => {});
});
