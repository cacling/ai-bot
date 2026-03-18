/**
 * skill-versions.ts — Skill 版本管理 API
 *
 * GET    /api/skill-versions/registry              — 技能注册表
 * GET    /api/skill-versions?skill=bill-inquiry     — 版本列表
 * GET    /api/skill-versions/:skill/:versionNo      — 版本快照文件树
 * POST   /api/skill-versions/save                   — 保存为版本（从当前 skill 目录）
 * POST   /api/skill-versions/save-version           — 保存版本（draft → saved）
 * POST   /api/skill-versions/publish                — 发布指定版本
 * POST   /api/skill-versions/create-from            — 基于某版本创建新版本
 */

import { Hono } from 'hono';
import { readdir, stat } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import {
  getVersionList,
  getVersionDetail,
  markVersionSaved,
  publishVersion,
  createVersionFrom,
  listSkillRegistry,
} from './version-manager';
import { logger } from '../../../services/logger';
import { SKILLS_ROOT } from '../../../services/paths';

const PROJECT_ROOT = resolve(import.meta.dir, '../../../..');

const app = new Hono();

// GET /api/skill-versions/registry
app.get('/registry', async (c) => {
  return c.json({ items: listSkillRegistry() });
});

// GET /api/skill-versions?skill=bill-inquiry
app.get('/', async (c) => {
  const skillId = c.req.query('skill');
  if (!skillId) return c.json({ error: 'skill 参数缺失' }, 400);
  const versions = await getVersionList(skillId);
  return c.json({ skill: skillId, versions, total: versions.length });
});

// GET /api/skill-versions/:skill/:versionNo — 版本快照文件树
app.get('/:skill/:versionNo', async (c) => {
  const skillId = c.req.param('skill');
  const versionNo = Number(c.req.param('versionNo'));
  const version = getVersionDetail(skillId, versionNo);
  if (!version || !version.snapshot_path) {
    return c.json({ error: `版本 v${versionNo} 不存在` }, 404);
  }

  const snapshotDir = resolve(SKILLS_ROOT, version.snapshot_path);

  interface TreeNode { name: string; type: 'file' | 'dir'; path: string; children?: TreeNode[] }

  async function buildTree(dir: string): Promise<TreeNode[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      if (entry.name.endsWith('.draft')) continue;
      const absPath = join(dir, entry.name);
      const relPath = relative(PROJECT_ROOT, absPath);
      if (entry.isDirectory()) {
        const children = await buildTree(absPath);
        nodes.push({ name: entry.name, type: 'dir', path: relPath, children });
      } else {
        nodes.push({ name: entry.name, type: 'file', path: relPath });
      }
    }
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  }

  const tree = await buildTree(snapshotDir);
  return c.json({ version, tree });
});

// POST /api/skill-versions/save-version — 标记版本为已保存（draft → saved）
app.post('/save-version', async (c) => {
  const body = await c.req.json<{ skill: string; version_no: number }>();
  if (!body.skill || !body.version_no) return c.json({ error: 'skill 和 version_no 必填' }, 400);
  markVersionSaved(body.skill, body.version_no);
  return c.json({ ok: true });
});

// POST /api/skill-versions/publish — 发布指定版本
app.post('/publish', async (c) => {
  const body = await c.req.json<{ skill: string; version_no: number; operator?: string }>();
  if (!body.skill || !body.version_no) return c.json({ error: 'skill 和 version_no 必填' }, 400);
  const result = await publishVersion(body.skill, body.version_no, body.operator ?? 'system');
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

// POST /api/skill-versions/create-from — 基于某版本创建新版本
app.post('/create-from', async (c) => {
  const body = await c.req.json<{ skill: string; from_version: number; description?: string; operator?: string }>();
  if (!body.skill || !body.from_version) return c.json({ error: 'skill 和 from_version 必填' }, 400);
  try {
    const result = await createVersionFrom(body.skill, body.from_version, body.description ?? '', body.operator ?? 'system');
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// POST /api/skill-versions/test — 直接用版本快照测试（不创建沙箱）
app.post('/test', async (c) => {
  const body = await c.req.json<{ skill: string; version_no: number; message: string; phone?: string; lang?: 'zh' | 'en'; useMock?: boolean }>();
  if (!body.skill || !body.version_no || !body.message) {
    return c.json({ error: 'skill, version_no, message 必填' }, 400);
  }

  const version = getVersionDetail(body.skill, body.version_no);
  if (!version?.snapshot_path) return c.json({ error: `版本 v${body.version_no} 不存在` }, 404);

  const skillsDir = resolve(SKILLS_ROOT, version.snapshot_path, '..');
  // snapshot_path = ".versions/bill-inquiry/v2" → parent = ".versions/bill-inquiry"
  // But runAgent expects a dir containing skill folders, so we need to restructure:
  // The snapshot IS the skill dir, so we create a virtual parent with the skill as a subdirectory
  const snapshotAbsPath = resolve(SKILLS_ROOT, version.snapshot_path);

  // runAgent expects skillsDir to contain skill subdirs (e.g. skillsDir/bill-inquiry/SKILL.md)
  // But our snapshot is already the skill dir. Use a symlink-like approach:
  // Actually, just pass the snapshot's parent as skillsDir and skill name matches the dir name? No.
  // The simplest: pass snapshot dir directly and let runAgent find SKILL.md in it.
  // runAgent uses overrideSkillsDir which scans for subdirs. We need the snapshot to be inside a parent.
  // Solution: use a temp dir with a symlink, or restructure.

  // Simplest approach: use runAgent's existing useMock + the snapshot path
  const { runAgent } = await import('../../../engine/runner');

  try {
    // Create a virtual skills dir structure: tempParent/{skillId}/ -> snapshot
    const { mkdtempSync, symlinkSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const tempParent = mkdtempSync(join(tmpdir(), 'skill-test-'));
    try {
      symlinkSync(snapshotAbsPath, join(tempParent, body.skill));
      const result = await runAgent(
        body.message,
        [],
        body.phone ?? '13800000001',
        body.lang ?? 'zh',
        undefined, undefined, undefined, undefined,
        tempParent,
        { useMock: body.useMock !== false },
      );
      return c.json({ text: result.text, card: result.card ?? null, mock: body.useMock !== false });
    } finally {
      rmSync(tempParent, { recursive: true, force: true });
    }
  } catch (err) {
    return c.json({ error: `测试失败: ${String(err)}` }, 500);
  }
});

export default app;
