import { Hono } from 'hono';
import { resolve, join, relative, extname, basename } from 'node:path';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { logger } from '../logger';
import { saveSkillWithVersion } from '../compliance/version-manager';
import { requireRole } from '../middleware/auth';

const files = new Hono();

// Project root is the backend/ directory itself (skills/ and mcp_servers/ now live inside it)
const PROJECT_ROOT = resolve(import.meta.dir, '../..');

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
  const resolved = resolve(PROJECT_ROOT, filePath);
  return resolved.startsWith(PROJECT_ROOT + '/') || resolved === PROJECT_ROOT;
}

// GET /api/files/tree
files.get('/tree', async (c) => {
  const nodes = await scanDir(PROJECT_ROOT, '');
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

  const absPath = resolve(PROJECT_ROOT, filePath);
  try {
    const content = await readFile(absPath, 'utf-8');
    logger.info('files', 'read_ok', { path: filePath, bytes: Buffer.byteLength(content) });
    return c.json({ path: filePath, content });
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

  // Skill 文件（.md）走版本管理；其他文件直接写入
  const isSkillFile = filePath.endsWith('.md') && (filePath.includes('skills/') || filePath.includes('agent/'));
  const absPath = resolve(PROJECT_ROOT, filePath);
  try {
    if (isSkillFile) {
      const { versionId } = await saveSkillWithVersion(filePath, content, '手动编辑', 'editor');
      logger.info('files', 'write_ok_versioned', { path: filePath, versionId, bytes: Buffer.byteLength(content) });
      return c.json({ ok: true, path: filePath, versionId });
    } else {
      await writeFile(absPath, content, 'utf-8');
      logger.info('files', 'write_ok', { path: filePath, bytes: Buffer.byteLength(content) });
      return c.json({ ok: true, path: filePath });
    }
  } catch (err) {
    logger.warn('files', 'write_error', { path: filePath, error: String(err) });
    return c.json({ error: `写入失败: ${String(err)}` }, 500);
  }
});

export default files;
