/**
 * skills.ts — Biz-skills 元数据 & 文件树 API
 *
 * GET /api/skills           — 列出所有 biz-skills 元数据
 * GET /api/skills/:id/files — 返回指定 skill 的完整文件树（所有类型）
 */

import { Hono } from 'hono';
import { resolve, join, relative } from 'node:path';
import { readdir, readFile, stat, rm } from 'node:fs/promises';
import { db } from '../db';
import { skillRegistry, skillVersions } from '../db';
import { eq } from 'drizzle-orm';
import { logger } from '../logger';

import { REPO_ROOT } from '../paths';
const PROJECT_ROOT = REPO_ROOT;

const skills = new Hono();

import { BIZ_SKILLS_DIR } from '../paths';

/**
 * 极简 YAML frontmatter 解析器。
 * 只提取第一层 key: value 形式的字段（忽略嵌套块如 metadata:）。
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1 || line.startsWith(' ') || line.startsWith('\t')) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

export interface SkillMeta {
  id: string;          // 目录名，如 "bill-inquiry"
  name: string;        // frontmatter name 字段
  description: string; // frontmatter description 字段
  updatedAt: string;   // SKILL.md 最后修改时间 ISO8601
}

// 文件树节点（path 相对于 PROJECT_ROOT，可直接传给 /api/files/content）
export interface SkillFileNode {
  name: string;
  type: 'file' | 'dir';
  path: string;
  children?: SkillFileNode[];
}

const EXCLUDED = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build']);

async function scanSkillDir(absDir: string): Promise<SkillFileNode[]> {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: SkillFileNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.isDirectory()) continue;
    if (EXCLUDED.has(entry.name)) continue;

    const absChild = join(absDir, entry.name);
    const relPath = relative(PROJECT_ROOT, absChild);

    if (entry.isDirectory()) {
      const children = await scanSkillDir(absChild);
      nodes.push({ name: entry.name, type: 'dir', path: relPath, children });
    } else {
      nodes.push({ name: entry.name, type: 'file', path: relPath });
    }
  }

  // 目录在前，文件在后，同类按字母排序
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

// GET /api/skills
skills.get('/', async (c) => {
  try {
    let entries;
    try {
      entries = await readdir(BIZ_SKILLS_DIR, { withFileTypes: true });
    } catch {
      logger.warn('skills', 'list_readdir_error', { dir: BIZ_SKILLS_DIR });
      return c.json({ skills: [] });
    }

    const result: SkillMeta[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillMdPath = join(BIZ_SKILLS_DIR, entry.name, 'SKILL.md');
      try {
        const [content, fileStat] = await Promise.all([
          readFile(skillMdPath, 'utf-8'),
          stat(skillMdPath),
        ]);
        const fm = parseFrontmatter(content);
        result.push({
          id: entry.name,
          name: fm.name || entry.name,
          description: fm.description || '',
          updatedAt: fileStat.mtime.toISOString(),
        });
      } catch {
        // SKILL.md 不存在或不可读，跳过该目录
      }
    }

    // 按目录名排序，保持稳定顺序
    result.sort((a, b) => a.id.localeCompare(b.id));

    logger.info('skills', 'list', { count: result.length, dir: BIZ_SKILLS_DIR });
    return c.json({ skills: result });
  } catch (err) {
    logger.warn('skills', 'list_error', { error: String(err) });
    return c.json({ error: String(err) }, 500);
  }
});

// GET /api/skills/:id/files
skills.get('/:id/files', async (c) => {
  const id = c.req.param('id');
  // 只允许合法目录名，防止路径穿越
  if (!/^[\w-]+$/.test(id)) {
    return c.json({ error: 'invalid skill id' }, 400);
  }

  const skillDir = join(BIZ_SKILLS_DIR, id);

  // 验证目录存在
  try {
    const s = await stat(skillDir);
    if (!s.isDirectory()) throw new Error('not a directory');
  } catch {
    return c.json({ error: `skill "${id}" not found` }, 404);
  }

  const tree = await scanSkillDir(skillDir);
  logger.info('skills', 'files', { id, count: tree.length });
  return c.json({ tree });
});

// DELETE /api/skills/:id
skills.delete('/:id', async (c) => {
  const id = c.req.param('id');
  // 只允许合法目录名，防止路径穿越
  if (!/^[\w-]+$/.test(id)) {
    return c.json({ error: 'invalid skill id' }, 400);
  }

  const skillDir = join(BIZ_SKILLS_DIR, id);

  try {
    // 1. 删除 skill_versions 表中该 skill 的所有版本记录
    await db.delete(skillVersions).where(eq(skillVersions.skill_id, id));

    // 2. 删除 skill_registry 表中该 skill 记录
    await db.delete(skillRegistry).where(eq(skillRegistry.id, id));

    // 3. 删除磁盘上该 skill 的目录
    await rm(skillDir, { recursive: true, force: true });

    logger.info('skills', 'deleted', { id });
    return c.json({ ok: true });
  } catch (err) {
    logger.error('skills', 'delete_error', { id, error: String(err) });
    return c.json({ error: String(err) }, 500);
  }
});

export default skills;
