/**
 * API tests for: src/agent/km/skills/skill-edit.ts
 * Routes: POST /api/skill-edit/clarify, POST /api/skill-edit, POST /api/skill-edit/apply
 * Mock: LLM(generateText), fs(readFileSync, writeFile), db(changeRequests)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('POST /api/skill-edit/clarify', () => {
  test.skip('returns clarification questions for ambiguous edit request', async () => {});
  test.skip('returns 400 when skill_name is missing', async () => {});
});

describe('POST /api/skill-edit', () => {
  test.skip('returns diff (old_fragment → new_fragment) for edit request', async () => {});
  test.skip('generates correct diff for adding a new state', async () => {});
});

describe('POST /api/skill-edit/apply', () => {
  test.skip('applies diff and writes updated file', async () => {});
  test.skip('returns 409 when old_fragment does not match (concurrent edit)', async () => {});
  test.skip('creates change-request when edit is high-risk', async () => {});
});
