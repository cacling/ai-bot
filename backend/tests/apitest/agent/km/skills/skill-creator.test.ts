/**
 * API tests for: src/agent/km/skills/skill-creator.ts
 * Routes: POST /api/skill-creator/chat, POST /api/skill-creator/save
 * Mock: LLM(skillCreatorModel), fs, db(testCases, skillVersions), MCP(getToolsOverview), validation
 */
import { describe, test, expect, mock } from 'bun:test';

describe('POST /api/skill-creator/chat', () => {
  test.skip('starts new session when no session_id provided', async () => {});
  test.skip('continues existing session with session_id', async () => {});
  test.skip('returns reply and phase (interview/draft/confirm/done)', async () => {});
  test.skip('returns draft object when phase transitions to draft', async () => {});
  test.skip('returns 400 when message is empty/whitespace', async () => {});
});

describe('POST /api/skill-creator/save', () => {
  test.skip('returns 400 when skill_name is not kebab-case', async () => {});
  test.skip('returns 422 when SKILL.md fails structural validation', async () => {});
  test.skip('saves skill directory with SKILL.md, references, and version record', async () => {});
  test.skip('auto-creates test cases from draft', async () => {});
});
