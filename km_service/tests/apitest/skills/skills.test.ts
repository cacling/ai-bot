/**
 * API tests for: src/agent/km/skills/skills.ts
 * Routes: GET /api/skills, GET /api/skills/:id/files, DELETE /api/skills/:id
 * Mock: fs(readdir, readFile, stat, rm), db(skillRegistry, skillVersions)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, deleteJSON } from '../helpers';
import { tableStubs, pathsStubs } from '../mock-db-stubs';

// ── Mock data ───────────────────────────────────────────────────────────────

const SKILL_MD_CONTENT = `---
name: bill-inquiry
description: Query monthly bills
metadata:
  version: "1.0.0"
  channels: ["online", "voice"]
---

# Bill Inquiry Skill
`;

const SKILL_MTIME = new Date('2026-03-01T00:00:00Z');

// ── Mock fs/promises ────────────────────────────────────────────────────────

let mockDirEntries: Array<{ name: string; isDirectory: () => boolean }> = [];
let mockFileContent: string = SKILL_MD_CONTENT;
let mockStatResult: { mtime: Date; isDirectory: () => boolean } = {
  mtime: SKILL_MTIME,
  isDirectory: () => true,
};
let statShouldFail = false;
let readdirShouldFail = false;
let rmCalled = false;

const fsMock = () => ({
  readdir: async (_path: string, _opts?: unknown) => {
    if (readdirShouldFail) throw new Error('readdir failed');
    return mockDirEntries;
  },
  readFile: async (_path: string, _enc?: string) => mockFileContent,
  stat: async (_path: string) => {
    if (statShouldFail) throw new Error('not found');
    return mockStatResult;
  },
  rm: async (_path: string, _opts?: unknown) => {
    rmCalled = true;
  },
  writeFile: async () => {},
});
mock.module('node:fs/promises', fsMock);
mock.module('fs/promises', fsMock);

// ── Mock db ─────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function buildMockDb() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          then: (r: (v: Row[]) => void) => r([]),
        }),
      }),
    }),
    insert: () => ({
      values: (v: Row | Row[]) => ({
        returning: () => ({ then: (r: (v: Row[]) => void) => r(Array.isArray(v) ? v : [v]) }),
        then: (r: (v: void) => void) => r(),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({ then: (r: (v: void) => void) => r() }),
      }),
    }),
    delete: () => ({
      where: () => ({ then: (r: (v: void) => void) => r() }),
    }),
    $count: () => 0,
  };
}

mock.module('../../../src/db', () => ({ db: buildMockDb(), ...tableStubs }));
mock.module('../../../src/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));
mock.module('../../../src/paths', () => ({ ...pathsStubs,
  REPO_ROOT: '/fake/repo',
  BIZ_SKILLS_DIR: '/fake/repo/backend/skills/biz-skills',
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

async function setupApp() {
  const mod = await import('../../../src/skills/skills');
  app = new Hono();
  app.route('/api/skills', mod.default);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/skills', () => {
  beforeEach(async () => {
    mockDirEntries = [
      { name: 'bill-inquiry', isDirectory: () => true },
      { name: 'plan-query', isDirectory: () => true },
    ];
    mockFileContent = SKILL_MD_CONTENT;
    mockStatResult = { mtime: SKILL_MTIME, isDirectory: () => true };
    readdirShouldFail = false;
    statShouldFail = false;
    await setupApp();
  });

  test('returns skill list with metadata from registry', async () => {
    const { status, body } = await getJSON(app, '/api/skills');
    expect(status).toBe(200);
    expect(body.skills).toBeDefined();
    expect(Array.isArray(body.skills)).toBe(true);
    expect(body.skills.length).toBe(2);
  });

  test('each skill has id, name, description, updatedAt', async () => {
    const { body } = await getJSON(app, '/api/skills');
    const skill = body.skills[0];
    expect(skill.id).toBeDefined();
    expect(skill.name).toBe('bill-inquiry');
    expect(skill.description).toBe('Query monthly bills');
    expect(skill.updatedAt).toBe('2026-03-01T00:00:00.000Z');
  });
});

describe('GET /api/skills/:id/files', () => {
  beforeEach(async () => {
    mockStatResult = { mtime: SKILL_MTIME, isDirectory: () => true };
    statShouldFail = false;
    mockDirEntries = [
      { name: 'SKILL.md', isDirectory: () => false },
    ];
    readdirShouldFail = false;
    await setupApp();
  });

  test('returns file tree for existing skill', async () => {
    const { status, body } = await getJSON(app, '/api/skills/bill-inquiry/files');
    expect(status).toBe(200);
    expect(body.tree).toBeDefined();
    expect(Array.isArray(body.tree)).toBe(true);
  });

  test('returns 404 for non-existent skill', async () => {
    statShouldFail = true;
    const { status, body } = await getJSON(app, '/api/skills/nonexistent/files');
    expect(status).toBe(404);
    expect(body.error).toContain('not found');
  });
});

describe('DELETE /api/skills/:id', () => {
  beforeEach(async () => {
    rmCalled = false;
    await setupApp();
  });

  test('deletes skill directory and registry entry', async () => {
    const { status, body } = await deleteJSON(app, '/api/skills/bill-inquiry');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(rmCalled).toBe(true);
  });

  test('returns 400 for invalid skill id', async () => {
    const { status, body } = await deleteJSON(app, '/api/skills/bad.id');
    expect(status).toBe(400);
    expect(body.error).toContain('invalid');
  });
});
