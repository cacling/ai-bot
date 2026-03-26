/**
 * API tests for: src/agent/km/skills/canary.ts
 * Routes: POST /api/canary/deploy, GET /api/canary/status, POST /api/canary/promote, DELETE /api/canary
 * Mock: fs(cp, mkdir, readFile, writeFile, rm, existsSync)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON, deleteJSON } from '../../../helpers';

// ── Track fs calls ──────────────────────────────────────────────────────────

let existingPaths: Set<string> = new Set();
let fileContents: Map<string, string> = new Map();
let copiedPaths: Array<{ src: string; dest: string }> = [];
let createdDirs: string[] = [];
let removedPaths: string[] = [];
let writtenFiles: Map<string, string> = new Map();

// ── Mock fs modules ─────────────────────────────────────────────────────────

const fsMock = {
  readFile: async (absPath: string, _enc?: string) => {
    const content = fileContents.get(absPath);
    if (content === undefined) throw new Error(`ENOENT: no such file '${absPath}'`);
    return content;
  },
  writeFile: async (absPath: string, content: string, _enc?: string) => {
    writtenFiles.set(absPath, content);
  },
  mkdir: async (absPath: string, _opts?: unknown) => {
    createdDirs.push(absPath);
  },
  cp: async (src: string, dest: string, _opts?: unknown) => {
    copiedPaths.push({ src, dest });
  },
  rm: async (absPath: string, _opts?: unknown) => {
    removedPaths.push(absPath);
  },
  readdir: async () => [],
  stat: async () => ({ isDirectory: () => false, isFile: () => true }),
  unlink: async () => {},
  access: async () => {},
  appendFile: async () => {},
  chmod: async () => {},
  chown: async () => {},
  copyFile: async () => {},
  lstat: async () => ({ isDirectory: () => false, isFile: () => true }),
  realpath: async (p: string) => p,
  rename: async () => {},
  rmdir: async () => {},
  constants: {},
};
mock.module('node:fs/promises', () => ({ default: fsMock, ...fsMock }));

const fsSyncMock = {
  existsSync: (p: string) => existingPaths.has(p),
  readFileSync: () => '',
  writeFileSync: () => {},
  readdirSync: () => [],
  statSync: () => ({ isDirectory: () => false, isFile: () => true }),
  mkdirSync: () => {},
  constants: { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 },
};
mock.module('node:fs', () => ({ default: fsSyncMock, ...fsSyncMock }));

mock.module('../../../../../src/services/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

mock.module('../../../../../src/services/auth', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

const FAKE_REPO = '/fake/repo';
mock.module('../../../../../src/services/paths', () => ({
  REPO_ROOT: FAKE_REPO,
}));

// ── App setup ───────────────────────────────────────────────────────────────

let app: Hono;

beforeEach(async () => {
  existingPaths = new Set();
  fileContents = new Map();
  copiedPaths = [];
  createdDirs = [];
  removedPaths = [];
  writtenFiles = new Map();

  // Re-import to reset in-memory canaryConfig (module-level state)
  // We need a fresh module each time — but bun caches imports.
  // Instead we just test sequentially within describe blocks.
  const mod = await import('../../../../../src/agent/km/skills/canary');
  app = new Hono();
  app.route('/api/canary', mod.default);
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/canary/deploy', () => {
  test('copies skill to .canary/ dir and sets percentage', async () => {
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    existingPaths.add(`${FAKE_REPO}/${skillPath}`);

    const { status, body } = await postJSON(app, '/api/canary/deploy', {
      skill_path: skillPath,
      percentage: 20,
    });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.ok).toBe(true);
    expect(b.canary).toBeDefined();
    expect(b.canary.skill_path).toBe(skillPath);
    expect(b.canary.percentage).toBe(20);
    expect(copiedPaths.length).toBeGreaterThan(0);
  });

  test('returns 400 when skill_path is missing', async () => {
    const { status, body } = await postJSON(app, '/api/canary/deploy', {});
    expect(status).toBe(400);
    expect((body as any).error).toBeDefined();
  });

  test('returns 400 when percentage is out of range', async () => {
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    existingPaths.add(`${FAKE_REPO}/${skillPath}`);

    const { status, body } = await postJSON(app, '/api/canary/deploy', {
      skill_path: skillPath,
      percentage: 150,
    });
    expect(status).toBe(400);
    expect((body as any).error).toContain('1-100');
  });
});

describe('GET /api/canary/status', () => {
  test('returns active:false when no canary is active', async () => {
    // This test must run first (before any deploy), since canaryConfig is module-level state
    // Cancel any existing canary to reset state
    await deleteJSON(app, '/api/canary');

    const { status, body } = await getJSON(app, '/api/canary/status');
    expect(status).toBe(200);
    expect((body as any).active).toBe(false);
  });

  test('returns current canary config after deploy', async () => {
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    existingPaths.add(`${FAKE_REPO}/${skillPath}`);
    await postJSON(app, '/api/canary/deploy', { skill_path: skillPath, percentage: 30 });

    const { status, body } = await getJSON(app, '/api/canary/status');
    expect(status).toBe(200);
    const b = body as any;
    expect(b.active).toBe(true);
    expect(b.skill_path).toBe(skillPath);
    expect(b.percentage).toBe(30);
  });
});

describe('POST /api/canary/promote', () => {
  test('copies canary to production and clears canary config', async () => {
    // Deploy first
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    existingPaths.add(`${FAKE_REPO}/${skillPath}`);
    await postJSON(app, '/api/canary/deploy', { skill_path: skillPath, percentage: 50 });

    // Set up canary SKILL.md content for readFile
    const canaryMdPath = `${FAKE_REPO}/backend/skills/.canary/bill-inquiry/SKILL.md`;
    fileContents.set(canaryMdPath, '---\nname: bill-inquiry\n---\n# Promoted Content');

    const { status, body } = await postJSON(app, '/api/canary/promote', {});
    expect(status).toBe(200);
    const b = body as any;
    expect(b.ok).toBe(true);
    expect(b.versionId).toBeDefined();

    // Verify canary config was cleared
    const statusRes = await getJSON(app, '/api/canary/status');
    expect((statusRes.body as any).active).toBe(false);
  });

  test('creates version record on promote', async () => {
    // Deploy first
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    existingPaths.add(`${FAKE_REPO}/${skillPath}`);
    await postJSON(app, '/api/canary/deploy', { skill_path: skillPath, percentage: 50 });

    const canaryMdPath = `${FAKE_REPO}/backend/skills/.canary/bill-inquiry/SKILL.md`;
    fileContents.set(canaryMdPath, '# Promoted');

    const { body } = await postJSON(app, '/api/canary/promote', {});
    const b = body as any;
    // Promote returns a versionId
    expect(b.ok).toBe(true);
    expect(b.versionId).toBeDefined();
    // Verify file was written to production path
    expect(writtenFiles.has(`${FAKE_REPO}/${skillPath}`)).toBe(true);
  });
});

describe('DELETE /api/canary', () => {
  test('removes .canary/ dir and resets config', async () => {
    // Deploy first
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    existingPaths.add(`${FAKE_REPO}/${skillPath}`);
    await postJSON(app, '/api/canary/deploy', { skill_path: skillPath, percentage: 10 });

    const { status, body } = await deleteJSON(app, '/api/canary');
    expect(status).toBe(200);
    expect((body as any).ok).toBe(true);
    expect(removedPaths.length).toBeGreaterThan(0);

    // Verify config cleared
    const statusRes = await getJSON(app, '/api/canary/status');
    expect((statusRes.body as any).active).toBe(false);
  });

  test('returns 400 when no canary is active', async () => {
    // Ensure no canary is active first — cancel if any leftover
    await deleteJSON(app, '/api/canary'); // clear any state from prior tests
    // Now try again — should get 400
    const { status, body } = await deleteJSON(app, '/api/canary');
    expect(status).toBe(400);
    expect((body as any).error).toBeDefined();
  });
});
