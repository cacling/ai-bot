/**
 * API tests for: src/agent/km/skills/skill-versions.ts
 * Routes: GET /api/skill-versions/registry, GET /api/skill-versions, GET /api/skill-versions/:skill/diagram-data,
 *         GET /api/skill-versions/:skill/:versionNo, POST save-version/publish/create-from/test
 * Mock: db(skillVersions, skillWorkflowSpecs, testPersonas), fs, version-manager, runAgent, mermaid
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/skill-versions/registry', () => {
  test.skip('returns skill registry list', async () => {});
});

describe('GET /api/skill-versions', () => {
  test.skip('returns version list for given skill query param', async () => {});
  test.skip('returns 400 when skill param is missing', async () => {});
});

describe('GET /api/skill-versions/:skill/diagram-data', () => {
  test.skip('returns stripped mermaid and nodeTypeMap', async () => {});
  test.skip('returns 404 for non-existent skill', async () => {});
});

describe('GET /api/skill-versions/:skill/:versionNo', () => {
  test.skip('returns version detail with files', async () => {});
});

describe('POST /api/skill-versions/save-version', () => {
  test.skip('marks version as saved in db', async () => {});
});

describe('POST /api/skill-versions/publish', () => {
  test.skip('publishes version and compiles workflow spec', async () => {});
  test.skip('rejects publish when .draft file exists', async () => {});
});

describe('POST /api/skill-versions/create-from', () => {
  test.skip('creates new version by copying from existing', async () => {});
});

describe('POST /api/skill-versions/test', () => {
  test.skip('runs agent with test message and returns response', async () => {});
});
