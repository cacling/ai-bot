import { Hono } from 'hono';
import { resolve, join, extname, basename, sep } from 'node:path';
import { readdir, readFile, writeFile, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { logger } from '../logger';
import { requireRole } from '../auth';

const files = new Hono();

import { REPO_ROOT } from '../paths';

// Allowed roots for file scanning — only these directories are visible to the file API
// Each entry: [absPath, shortAlias] — alias is the path prefix exposed to consumers
const ALLOWED_ROOTS_MAP: Array<[string, string]> = [
  [resolve(REPO_ROOT, 'km_service/skills'), 'skills'],
  [resolve(REPO_ROOT, 'mcp_servers'), 'mcp_servers'],
];
const ALLOWED_ROOTS = ALLOWED_ROOTS_MAP.map(([abs]) => abs);

/** Resolve a consumer-facing path (e.g. "skills/biz-skills/...") to an absolute path */
function resolveConsumerPath(filePath: string): string {
  for (const [absRoot, alias] of ALLOWED_ROOTS_MAP) {
    if (filePath === alias || filePath.startsWith(alias + '/')) {
      return resolve(absRoot, filePath.slice(alias.length + 1) || '.');
    }
  }
  return resolve(REPO_ROOT, filePath);
}

// Directories to exclude from scanning
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.venv',
  'venv',
  '__pycache__',
  '.next',
  'dist',
  'build',
  '.cache',
]);

interface FileNode {
  name: string;
  type: 'file' | 'dir';
  path: string; // relative to PROJECT_ROOT
  children?: FileNode[];
}

async function scanDir(absPath: string, relPath: string): Promise<FileNode[]> {
  let entries;
  try {
    entries = await readdir(absPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.isDirectory()) continue;
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    if (entry.name.endsWith('.draft')) continue;

    const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
    const childAbs = join(absPath, entry.name);

    if (entry.isDirectory()) {
      const children = await scanDir(childAbs, childRel);
      // Only include directories that contain .md files (recursively)
      if (children.length > 0) {
        nodes.push({ name: entry.name, type: 'dir', path: childRel, children });
      }
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      nodes.push({ name: entry.name, type: 'file', path: childRel });
    }
  }

  // Sort: directories first, then files, alphabetically
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

function isPathSafe(filePath: string): boolean {
  const resolved = resolveConsumerPath(filePath);
  return ALLOWED_ROOTS.some(root => resolved.startsWith(root + sep) || resolved === root);
}

// GET /api/files/tree
files.get('/tree', async (c) => {
  // Scan each allowed root and present as top-level entries
  const allNodes: FileNode[] = [];
  for (const [root, alias] of ALLOWED_ROOTS_MAP) {
    if (!existsSync(root)) continue;
    const children = await scanDir(root, alias);
    allNodes.push({ name: basename(root), path: alias, type: 'dir', children });
  }
  const nodes = allNodes;
  const count = nodes.reduce(function count(acc: number, n: FileNode): number {
    return acc + 1 + (n.children ? n.children.reduce(count, 0) : 0);
  }, 0);
  logger.info('files', 'tree', { nodes: count });
  return c.json({ tree: nodes });
});

// GET /api/files/content?path=...
files.get('/content', async (c) => {
  const filePath = c.req.query('path');
  if (!filePath) {
    logger.warn('files', 'read_rejected', { reason: 'missing_path' });
    return c.json({ error: 'path 参数缺失' }, 400);
  }
  const TEXT_EXTS = new Set(['.md', '.ts', '.tsx', '.js', '.jsx', '.py', '.sh', '.bash', '.json', '.yaml', '.yml', '.txt', '.toml', '.env']);
  if (!TEXT_EXTS.has(extname(filePath).toLowerCase())) {
    logger.warn('files', 'read_rejected', { path: filePath, reason: 'unsupported_type' });
    return c.json({ error: '不支持读取此文件类型' }, 400);
  }
  if (!isPathSafe(filePath)) {
    logger.warn('files', 'read_rejected', { path: filePath, reason: 'unsafe_path' });
    return c.json({ error: '路径不合法' }, 403);
  }

  const absPath = resolveConsumerPath(filePath);
  const draftPath = absPath + '.draft';
  try {
    // Check for draft first
    if (existsSync(draftPath)) {
      const content = await readFile(draftPath, 'utf-8');
      logger.info('files', 'read_draft', { path: filePath, bytes: Buffer.byteLength(content) });
      return c.json({ path: filePath, content, isDraft: true });
    }
    const content = await readFile(absPath, 'utf-8');
    logger.info('files', 'read_ok', { path: filePath, bytes: Buffer.byteLength(content) });
    return c.json({ path: filePath, content, isDraft: false });
  } catch (err) {
    logger.warn('files', 'read_error', { path: filePath, error: String(err) });
    return c.json({ error: `读取失败: ${String(err)}` }, 404);
  }
});

// PUT /api/files/content
files.put('/content', requireRole('config_editor'), async (c) => {
  const body = await c.req.json<{ path?: string; content?: string }>();
  const filePath = body.path;
  const content = body.content;

  if (!filePath || content === undefined) {
    logger.warn('files', 'write_rejected', { reason: 'missing_params' });
    return c.json({ error: 'path 和 content 不能为空' }, 400);
  }
  const TEXT_EXTS = new Set(['.md', '.ts', '.tsx', '.js', '.jsx', '.py', '.sh', '.bash', '.json', '.yaml', '.yml', '.txt', '.toml', '.env']);
  if (!TEXT_EXTS.has(extname(filePath).toLowerCase())) {
    logger.warn('files', 'write_rejected', { path: filePath, reason: 'unsupported_type' });
    return c.json({ error: '不支持写入此文件类型' }, 400);
  }
  if (!isPathSafe(filePath)) {
    logger.warn('files', 'write_rejected', { path: filePath, reason: 'unsafe_path' });
    return c.json({ error: '路径不合法' }, 403);
  }

  // 直接写入文件，不创建版本（版本由用户在版本列表手动创建）
  const absPath = resolveConsumerPath(filePath);
  try {
    await writeFile(absPath, content, 'utf-8');
    logger.info('files', 'write_ok', { path: filePath, bytes: Buffer.byteLength(content) });
    return c.json({ ok: true, path: filePath });
  } catch (err) {
    logger.warn('files', 'write_error', { path: filePath, error: String(err) });
    return c.json({ error: `写入失败: ${String(err)}` }, 500);
  }
});

// PUT /api/files/draft — 保存草稿（.draft 文件）
files.put('/draft', async (c) => {
  const body = await c.req.json<{ path?: string; content?: string }>();
  const filePath = body.path;
  const content = body.content;
  if (!filePath || content === undefined) return c.json({ error: 'path 和 content 不能为空' }, 400);
  if (!isPathSafe(filePath)) return c.json({ error: '路径不合法' }, 403);

  const draftPath = resolveConsumerPath(filePath) + '.draft';
  try {
    await writeFile(draftPath, content, 'utf-8');
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: `草稿保存失败: ${String(err)}` }, 500);
  }
});

// DELETE /api/files/draft?path=... — 删除草稿
files.delete('/draft', async (c) => {
  const filePath = c.req.query('path');
  if (!filePath) return c.json({ error: 'path 参数缺失' }, 400);
  if (!isPathSafe(filePath)) return c.json({ error: '路径不合法' }, 403);

  const draftPath = resolveConsumerPath(filePath) + '.draft';
  try {
    if (existsSync(draftPath)) await unlink(draftPath);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: `删除草稿失败: ${String(err)}` }, 500);
  }
});

// POST /api/files/create-file — 创建空文件
files.post('/create-file', async (c) => {
  const body = await c.req.json<{ path?: string }>();
  const filePath = body.path;
  if (!filePath) return c.json({ error: 'path 不能为空' }, 400);
  if (!isPathSafe(filePath)) return c.json({ error: '路径不合法' }, 403);
  if (!/^[\w\-./]+$/.test(filePath)) return c.json({ error: '文件名包含非法字符' }, 400);

  const absPath = resolveConsumerPath(filePath);
  if (existsSync(absPath)) return c.json({ error: '文件已存在' }, 409);

  try {
    const { mkdir: mkdirAsync } = await import('node:fs/promises');
    await mkdirAsync(resolve(absPath, '..'), { recursive: true });
    await writeFile(absPath, '', 'utf-8');
    logger.info('files', 'create_file', { path: filePath });
    return c.json({ ok: true, path: filePath });
  } catch (err) {
    return c.json({ error: `创建失败: ${String(err)}` }, 500);
  }
});

// POST /api/files/create-folder — 创建空文件夹
files.post('/create-folder', async (c) => {
  const body = await c.req.json<{ path?: string }>();
  const filePath = body.path;
  if (!filePath) return c.json({ error: 'path 不能为空' }, 400);
  if (!isPathSafe(filePath)) return c.json({ error: '路径不合法' }, 403);
  if (!/^[\w\-./]+$/.test(filePath)) return c.json({ error: '名称包含非法字符' }, 400);

  const absPath = resolveConsumerPath(filePath);
  if (existsSync(absPath)) return c.json({ error: '文件夹已存在' }, 409);

  try {
    const { mkdir: mkdirAsync } = await import('node:fs/promises');
    await mkdirAsync(absPath, { recursive: true });
    logger.info('files', 'create_folder', { path: filePath });
    return c.json({ ok: true, path: filePath });
  } catch (err) {
    return c.json({ error: `创建失败: ${String(err)}` }, 500);
  }
});

export default files;
