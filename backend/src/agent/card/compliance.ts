/**
 * compliance.ts — 合规词库管理 API
 *
 * GET    /api/compliance/keywords       — 获取全部词库
 * POST   /api/compliance/keywords       — 新增关键词
 * DELETE /api/compliance/keywords/:id   — 删除关键词
 * POST   /api/compliance/keywords/reload — 热重载 AC 自动机
 * POST   /api/compliance/check          — 在线检测（调试用）
 */

import { Hono } from 'hono';
import {
  getAllKeywords,
  addKeyword,
  removeKeyword,
  reloadKeywords,
  checkCompliance,
  type RuleCategory,
} from '../../compliance/keyword-filter';
import { logger } from '../../logger';
import { requireRole } from '../../middleware/auth';

const compliance = new Hono();

// GET /api/compliance/keywords
compliance.get('/keywords', (c) => {
  const keywords = getAllKeywords();
  return c.json({ keywords, total: keywords.length });
});

// POST /api/compliance/keywords
compliance.post('/keywords', requireRole('admin'), async (c) => {
  const body = await c.req.json<{
    keyword?: string;
    category?: RuleCategory;
    description?: string;
  }>();

  if (!body.keyword || !body.category) {
    return c.json({ error: 'keyword 和 category 不能为空' }, 400);
  }
  if (!['banned', 'warning', 'pii'].includes(body.category)) {
    return c.json({ error: 'category 必须为 banned / warning / pii' }, 400);
  }

  const entry = addKeyword(body.keyword, body.category, body.description);
  logger.info('compliance', 'keyword_added', { id: entry.id, keyword: entry.keyword, category: entry.category });
  return c.json({ ok: true, keyword: entry });
});

// DELETE /api/compliance/keywords/:id
compliance.delete('/keywords/:id', requireRole('admin'), (c) => {
  const id = c.req.param('id');
  const removed = removeKeyword(id);
  if (!removed) {
    return c.json({ error: `未找到 ID=${id} 的关键词` }, 404);
  }
  logger.info('compliance', 'keyword_removed', { id });
  return c.json({ ok: true, id });
});

// POST /api/compliance/keywords/reload
compliance.post('/keywords/reload', requireRole('admin'), (c) => {
  reloadKeywords();
  logger.info('compliance', 'keywords_reloaded', {});
  return c.json({ ok: true, total: getAllKeywords().length });
});

// POST /api/compliance/check — 在线检测（调试用）
compliance.post('/check', async (c) => {
  const body = await c.req.json<{ text?: string }>();
  if (!body.text) {
    return c.json({ error: 'text 不能为空' }, 400);
  }
  const result = checkCompliance(body.text);
  return c.json(result);
});

export default compliance;
