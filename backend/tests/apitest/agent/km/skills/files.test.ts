/**
 * API tests for: src/agent/km/skills/files.ts
 * Routes: GET /api/files/tree, GET/PUT /api/files/content, PUT /api/files/draft, DELETE /api/files/draft, POST /api/files/create-file, POST /api/files/create-folder
 * Mock: fs(readdir, readFile, writeFile, unlink, mkdir, existsSync, stat)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON, putJSON, deleteJSON } from '../../../helpers';

// ── Track fs calls ──────────────────────────────────────────────────────────

let writtenFiles: Map<string, string> = new Map();
let deletedFiles: string[] = [];
let createdDirs: string[] = [];
let existingPaths: Set<string> = new Set();
let fileContents: Map<string, string> = new Map();

// Fake directory entries for scanDir
interface FakeDirent {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
}

let readdirResults: Map<string, FakeDirent[]> = new Map();

// ── Mock fs modules ─────────────────────────────────────────────────────────

const fsMock = {
  readdir: async (absPath: string, _opts?: unknown) => {
    const entries = readdirResults.get(absPath);
    if (!entries) throw new Error(`ENOENT: no such directory '${absPath}'`);
    return entries;
  },
  readFile: async (absPath: string, _enc?: string) => {
    const content = fileContents.get(absPath);
    if (content === undefined) throw new Error(`ENOENT: no such file '${absPath}'`);
    return content;
  },
  writeFile: async (absPath: string, content: string, _enc?: string) => {
    writtenFiles.set(absPath, content);
  },
  stat: async (absPath: string) => {
    if (!existingPaths.has(absPath)) throw new Error(`ENOENT: '${absPath}'`);
    return { isDirectory: () => true, isFile: () => false };
  },
  unlink: async (absPath: string) => {
    deletedFiles.push(absPath);
  },
  mkdir: async (absPath: string, _opts?: unknown) => {
    createdDirs.push(absPath);
  },
  access: async () => {},
  appendFile: async () => {},
  chmod: async () => {},
  chown: async () => {},
  copyFile: async () => {},
  cp: async () => {},
  lchmod: async () => {},
  lchown: async () => {},
  link: async () => {},
  lstat: async () => ({ isDirectory: () => false, isFile: () => true }),
  lutimes: async () => {},
  mkdtemp: async () => '/tmp/mock',
  open: async () => ({}),
  opendir: async () => ({}),
  readlink: async () => '',
  realpath: async (p: string) => p,
  rename: async () => {},
  rm: async () => {},
  rmdir: async () => {},
  symlink: async () => {},
  truncate: async () => {},
  utimes: async () => {},
  watch: async function* () {},
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
  unlinkSync: () => {},
  accessSync: () => {},
  constants: { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 },
};
mock.module('node:fs', () => ({ default: fsSyncMock, ...fsSyncMock }));

mock.module('../../../../../src/services/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

mock.module('../../../../../src/services/auth', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

// Mock REPO_ROOT to a predictable path
const FAKE_REPO = '/fake/repo';
mock.module('../../../../../src/services/paths', () => ({
  REPO_ROOT: FAKE_REPO,
}));

// ── App setup ───────────────────────────────────────────────────────────────

let app: Hono;

beforeEach(async () => {
  writtenFiles.clear();
  deletedFiles = [];
  createdDirs = [];
  existingPaths = new Set();
  fileContents = new Map();
  readdirResults = new Map();

  // Default: allowed roots exist
  existingPaths.add(`${FAKE_REPO}/backend/skills`);
  existingPaths.add(`${FAKE_REPO}/mcp_servers`);

  const mod = await import('../../../../../src/agent/km/skills/files');
  app = new Hono();
  app.route('/api/files', mod.default);
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/files/tree', () => {
  test('returns tree structure with skills directory', async () => {
    // Set up readdir to return a single .md file inside skills
    const skillsPath = `${FAKE_REPO}/backend/skills`;
    const mcpPath = `${FAKE_REPO}/mcp_servers`;

    readdirResults.set(skillsPath, [
      { name: 'SKILL.md', isDirectory: () => false, isFile: () => true },
    ]);
    readdirResults.set(mcpPath, []);

    const { status, body } = await getJSON(app, '/api/files/tree');
    expect(status).toBe(200);
    const b = body as any;
    expect(b.tree).toBeArray();
    expect(b.tree.length).toBeGreaterThanOrEqual(1);
  });

  test('tree nodes have name, type, path, children fields', async () => {
    const skillsPath = `${FAKE_REPO}/backend/skills`;
    const mcpPath = `${FAKE_REPO}/mcp_servers`;

    readdirResults.set(skillsPath, [
      { name: 'test.md', isDirectory: () => false, isFile: () => true },
    ]);
    readdirResults.set(mcpPath, []);

    const { body } = await getJSON(app, '/api/files/tree');
    const b = body as any;
    const node = b.tree[0];
    expect(node).toHaveProperty('name');
    expect(node).toHaveProperty('type');
    expect(node).toHaveProperty('path');
    expect(node).toHaveProperty('children');
  });
});

describe('GET /api/files/content', () => {
  test('returns 400 when path param is missing', async () => {
    const { status, body } = await getJSON(app, '/api/files/content');
    expect(status).toBe(400);
    expect((body as any).error).toBeDefined();
  });

  test('returns 400 for unsupported file extension', async () => {
    const { status, body } = await getJSON(app, '/api/files/content?path=backend/skills/test.exe');
    expect(status).toBe(400);
    expect((body as any).error).toContain('不支持');
  });

  test('returns 404 for non-existent file', async () => {
    // existsSync returns false for draft, readFile throws
    const { status, body } = await getJSON(app, '/api/files/content?path=backend/skills/missing.md');
    expect(status).toBe(404);
    expect((body as any).error).toBeDefined();
  });

  test('returns file content for valid .md path', async () => {
    const absPath = `${FAKE_REPO}/backend/skills/test.md`;
    fileContents.set(absPath, '# Hello World');

    const { status, body } = await getJSON(app, '/api/files/content?path=backend/skills/test.md');
    expect(status).toBe(200);
    const b = body as any;
    expect(b.content).toBe('# Hello World');
    expect(b.path).toBe('backend/skills/test.md');
    expect(b.isDraft).toBe(false);
  });
});

describe('PUT /api/files/content', () => {
  test('returns 400 when path is missing', async () => {
    const { status, body } = await putJSON(app, '/api/files/content', { content: 'hello' });
    expect(status).toBe(400);
    expect((body as any).error).toBeDefined();
  });

  test('returns 400 when content is missing', async () => {
    const { status, body } = await putJSON(app, '/api/files/content', { path: 'backend/skills/test.md' });
    expect(status).toBe(400);
    expect((body as any).error).toBeDefined();
  });

  test('returns 400 for unsupported file extension', async () => {
    const { status, body } = await putJSON(app, '/api/files/content', { path: 'backend/skills/test.exe', content: 'hi' });
    expect(status).toBe(400);
    expect((body as any).error).toContain('不支持');
  });

  test('writes content and returns ok:true', async () => {
    const { status, body } = await putJSON(app, '/api/files/content', {
      path: 'backend/skills/test.md',
      content: '# Updated',
    });
    expect(status).toBe(200);
    expect((body as any).ok).toBe(true);
    expect(writtenFiles.has(`${FAKE_REPO}/backend/skills/test.md`)).toBe(true);
    expect(writtenFiles.get(`${FAKE_REPO}/backend/skills/test.md`)).toBe('# Updated');
  });
});

describe('PUT /api/files/draft', () => {
  test('creates .draft file alongside original', async () => {
    const { status, body } = await putJSON(app, '/api/files/draft', {
      path: 'backend/skills/test.md',
      content: '# Draft content',
    });
    expect(status).toBe(200);
    expect((body as any).ok).toBe(true);
    expect(writtenFiles.has(`${FAKE_REPO}/backend/skills/test.md.draft`)).toBe(true);
  });
});

describe('DELETE /api/files/draft', () => {
  test('removes .draft file and returns ok:true', async () => {
    const draftPath = `${FAKE_REPO}/backend/skills/test.md.draft`;
    existingPaths.add(draftPath);

    const { status, body } = await deleteJSON(app, '/api/files/draft?path=backend/skills/test.md');
    expect(status).toBe(200);
    expect((body as any).ok).toBe(true);
    expect(deletedFiles).toContain(draftPath);
  });
});

describe('POST /api/files/create-file', () => {
  test('creates new file at specified path', async () => {
    const { status, body } = await postJSON(app, '/api/files/create-file', {
      path: 'backend/skills/new-skill/SKILL.md',
    });
    expect(status).toBe(200);
    expect((body as any).ok).toBe(true);
    expect((body as any).path).toBe('backend/skills/new-skill/SKILL.md');
    // Verify writeFile was called
    expect(writtenFiles.has(`${FAKE_REPO}/backend/skills/new-skill/SKILL.md`)).toBe(true);
  });

  test('returns 409 when path already exists', async () => {
    existingPaths.add(`${FAKE_REPO}/backend/skills/existing.md`);

    const { status, body } = await postJSON(app, '/api/files/create-file', {
      path: 'backend/skills/existing.md',
    });
    expect(status).toBe(409);
    expect((body as any).error).toContain('已存在');
  });
});

describe('POST /api/files/create-folder', () => {
  test('creates new directory at specified path', async () => {
    const { status, body } = await postJSON(app, '/api/files/create-folder', {
      path: 'backend/skills/new-folder',
    });
    expect(status).toBe(200);
    expect((body as any).ok).toBe(true);
    expect(createdDirs.length).toBeGreaterThan(0);
  });
});
