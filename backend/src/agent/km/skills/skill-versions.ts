/**
 * skill-versions.ts — Skill 版本管理 API
 *
 * GET    /api/skill-versions?path=...        — 版本列表
 * GET    /api/skill-versions/:id             — 获取指定版本内容
 * GET    /api/skill-versions/diff?from=x&to=y — Diff 对比
 * POST   /api/skill-versions/rollback        — 回滚到指定版本
 */

import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  getVersionList,
  getVersionContent,
  rollbackToVersion,
} from '../../../compliance/version-manager';
import { logger } from '../../../logger';
import { requireRole } from '../../../middleware/auth';

const PROJECT_ROOT = resolve(import.meta.dir, '../../../..');

const skillVersionsRoute = new Hono();

// GET /api/skill-versions?path=biz-skills/bill-inquiry/SKILL.md
skillVersionsRoute.get('/', async (c) => {
  const path = c.req.query('path');
  if (!path) {
    return c.json({ error: 'path 参数缺失' }, 400);
  }
  const versions = await getVersionList(path);
  return c.json({ path, versions, total: versions.length });
});

// GET /api/skill-versions/diff?from=3&to=5
// 如果 to 省略，则与当前文件内容对比
skillVersionsRoute.get('/diff', async (c) => {
  const fromId = Number(c.req.query('from'));
  const toId = c.req.query('to') ? Number(c.req.query('to')) : null;

  if (!fromId || isNaN(fromId)) {
    return c.json({ error: 'from 参数无效' }, 400);
  }

  const fromVersion = await getVersionContent(fromId);
  if (!fromVersion) {
    return c.json({ error: `版本 ${fromId} 不存在` }, 404);
  }

  let toContent: string;
  let toLabel: string;

  if (toId) {
    const toVersion = await getVersionContent(toId);
    if (!toVersion) {
      return c.json({ error: `版本 ${toId} 不存在` }, 404);
    }
    toContent = toVersion.content;
    toLabel = `v${toId}`;
  } else {
    // 与当前文件对比
    try {
      toContent = await readFile(resolve(PROJECT_ROOT, fromVersion.skill_path), 'utf-8');
      toLabel = 'current';
    } catch {
      return c.json({ error: '无法读取当前文件' }, 500);
    }
  }

  // 生成简单的行级 diff
  const fromLines = fromVersion.content.split('\n');
  const toLines = toContent.split('\n');
  const diff = generateLineDiff(fromLines, toLines);

  return c.json({
    from: { id: fromId, label: `v${fromId}` },
    to: { id: toId, label: toLabel },
    path: fromVersion.skill_path,
    diff,
    fromContent: fromVersion.content,
    toContent,
  });
});

// GET /api/skill-versions/:id
skillVersionsRoute.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'id 参数无效' }, 400);
  }
  const version = await getVersionContent(id);
  if (!version) {
    return c.json({ error: `版本 ${id} 不存在` }, 404);
  }
  return c.json({ version });
});

// POST /api/skill-versions/rollback
skillVersionsRoute.post('/rollback', requireRole('flow_manager'), async (c) => {
  const body = await c.req.json<{ version_id?: number; operator?: string }>();
  if (!body.version_id) {
    return c.json({ error: 'version_id 不能为空' }, 400);
  }
  const result = await rollbackToVersion(body.version_id, body.operator ?? 'system');
  if (!result.success) {
    return c.json({ error: result.error }, 404);
  }
  logger.info('skill-versions', 'rollback_api', { versionId: body.version_id, newVersionId: result.newVersionId });
  return c.json({ ok: true, newVersionId: result.newVersionId });
});

export default skillVersionsRoute;

// ── 简单行级 Diff ──────────────────────────────────────────────────────────────

interface DiffLine {
  type: 'equal' | 'add' | 'remove';
  content: string;
  lineFrom?: number;
  lineTo?: number;
}

function generateLineDiff(fromLines: string[], toLines: string[]): DiffLine[] {
  // 使用最长公共子序列（LCS）算法生成行级 diff
  const m = fromLines.length;
  const n = toLines.length;

  // 构建 LCS 表
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (fromLines[i - 1] === toLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯生成 diff
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && fromLines[i - 1] === toLines[j - 1]) {
      result.unshift({ type: 'equal', content: fromLines[i - 1], lineFrom: i, lineTo: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', content: toLines[j - 1], lineTo: j });
      j--;
    } else {
      result.unshift({ type: 'remove', content: fromLines[i - 1], lineFrom: i });
      i--;
    }
  }

  return result;
}
