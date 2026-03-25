/**
 * API tests for: src/agent/km/skills/canary.ts
 * Routes: POST /api/canary/deploy, GET /api/canary/status, POST /api/canary/promote, DELETE /api/canary
 * Mock: fs(cp, mkdir, readFile, writeFile, rm), in-memory canaryConfig
 */
import { describe, test, expect, mock } from 'bun:test';

describe('POST /api/canary/deploy', () => {
  test.skip('copies skill to .canary/ dir and sets percentage', async () => {});
  test.skip('returns 400 when skill_name is missing', async () => {});
  test.skip('returns 400 when percentage is out of range', async () => {});
});

describe('GET /api/canary/status', () => {
  test.skip('returns current canary config (skill, percentage, deployed_at)', async () => {});
  test.skip('returns null when no canary is active', async () => {});
});

describe('POST /api/canary/promote', () => {
  test.skip('copies canary to production and clears canary config', async () => {});
  test.skip('creates version record on promote', async () => {});
});

describe('DELETE /api/canary', () => {
  test.skip('removes .canary/ dir and resets config', async () => {});
  test.skip('returns ok even when no canary is active (idempotent)', async () => {});
});
