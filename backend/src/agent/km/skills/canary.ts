/**
 * canary.ts — 灰度发布管理
 *
 * POST   /api/canary/deploy   — 将 Skill 推入灰度（复制到 .canary/）
 * GET    /api/canary/status    — 当前灰度状态
 * POST   /api/canary/promote   — 灰度转全量（复制回主路径+创建版本）
 * DELETE /api/canary           — 取消灰度（删除 .canary/ 目录）
 */

import { Hono } from 'hono';
import { resolve, dirname, basename } from 'node:path';
import { readFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
// Canary promote now writes directly to file
import { requireRole } from '../../../services/auth';
import { logger } from '../../../services/logger';

import { REPO_ROOT } from '../../../services/paths';
const PROJECT_ROOT = REPO_ROOT;
const CANARY_ROOT = resolve(PROJECT_ROOT, 'backend/skills', '.canary');

interface CanaryConfig {
  skill_path: string;
  percentage: number;
  createdAt: string;
}

let canaryConfig: CanaryConfig | null = null;

const canary = new Hono();

// POST /api/canary/deploy
canary.post('/deploy', requireRole('flow_manager'), async (c) => {
  const body = await c.req.json<{ skill_path?: string; percentage?: number }>();
  const skillPath = body.skill_path;
  if (!skillPath) {
    return c.json({ error: 'skill_path 不能为空' }, 400);
  }

  const absSource = resolve(PROJECT_ROOT, skillPath);
  if (!existsSync(absSource)) {
    return c.json({ error: `文件不存在: ${skillPath}` }, 404);
  }

  const percentage = body.percentage ?? 10;
  if (percentage < 1 || percentage > 100) {
    return c.json({ error: 'percentage 必须在 1-100 之间' }, 400);
  }

  // Copy skill directory to .canary/
  const skillDir = dirname(absSource);
  const skillDirName = basename(skillDir);
  const canarySkillDir = resolve(CANARY_ROOT, skillDirName);

  await mkdir(dirname(canarySkillDir), { recursive: true });
  await cp(skillDir, canarySkillDir, { recursive: true });

  canaryConfig = {
    skill_path: skillPath,
    percentage,
    createdAt: new Date().toISOString(),
  };

  logger.info('canary', 'deployed', { skillPath, percentage });
  return c.json({ ok: true, canary: canaryConfig });
});

// GET /api/canary/status
canary.get('/status', async (c) => {
  if (!canaryConfig) {
    return c.json({ active: false });
  }
  return c.json({ active: true, ...canaryConfig });
});

// POST /api/canary/promote
canary.post('/promote', requireRole('flow_manager'), async (c) => {
  if (!canaryConfig) {
    return c.json({ error: '当前没有灰度发布' }, 400);
  }

  const skillDirName = basename(dirname(resolve(PROJECT_ROOT, canaryConfig.skill_path)));
  const canaryMdPath = resolve(CANARY_ROOT, skillDirName, 'SKILL.md');

  try {
    const newContent = await readFile(canaryMdPath, 'utf-8');
    const { writeFile: writeFileAsync } = await import('node:fs/promises');
    await writeFileAsync(resolve(PROJECT_ROOT, canaryConfig.skill_path), newContent, 'utf-8');

    // Clean up canary directory
    await rm(CANARY_ROOT, { recursive: true, force: true });
    const promotedConfig = { ...canaryConfig };
    canaryConfig = null;

    const versionId = (promotedConfig as Record<string, unknown>).version as string ?? 'promoted';
    logger.info('canary', 'promoted', { skillPath: promotedConfig.skill_path, versionId });
    return c.json({ ok: true, versionId });
  } catch (err) {
    return c.json({ error: `灰度转全量失败: ${String(err)}` }, 500);
  }
});

// DELETE /api/canary
canary.delete('/', requireRole('flow_manager'), async (c) => {
  if (!canaryConfig) {
    return c.json({ error: '当前没有灰度发布' }, 400);
  }

  await rm(CANARY_ROOT, { recursive: true, force: true });
  canaryConfig = null;

  logger.info('canary', 'cancelled', {});
  return c.json({ ok: true });
});

/**
 * 根据手机号末位数字决定是否路由到灰度目录
 */
export function resolveSkillsDir(phone: string, defaultDir: string): string {
  if (!canaryConfig) return defaultDir;
  const lastDigit = parseInt(phone.slice(-1), 10);
  const threshold = Math.floor((canaryConfig.percentage / 100) * 10);
  if (lastDigit < threshold) {
    return resolve(CANARY_ROOT); // .canary/ path
  }
  return defaultDir;
}

export default canary;
