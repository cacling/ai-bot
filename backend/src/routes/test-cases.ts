/**
 * test-cases.ts — 回归测试用例管理
 *
 * GET  /api/test-cases?skill=xxx   — 获取用例列表
 * POST /api/test-cases             — 新增测试用例
 * DELETE /api/test-cases/:id       — 删除用例
 */

import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { testCases } from '../db/schema';
import { logger } from '../logger';

const testCaseRoutes = new Hono();

// GET /api/test-cases?skill=xxx
testCaseRoutes.get('/', async (c) => {
  const skill = c.req.query('skill');
  if (skill) {
    const rows = await db
      .select()
      .from(testCases)
      .where(eq(testCases.skill_name, skill))
      .orderBy(desc(testCases.created_at));
    return c.json(rows);
  }
  const rows = await db
    .select()
    .from(testCases)
    .orderBy(desc(testCases.created_at));
  return c.json(rows);
});

// POST /api/test-cases
testCaseRoutes.post('/', async (c) => {
  const body = await c.req.json<{
    skill_name?: string;
    input_message?: string;
    expected_keywords?: string[];
    phone?: string;
  }>();

  if (!body.skill_name || !body.input_message || !body.expected_keywords) {
    return c.json({ error: 'skill_name, input_message, expected_keywords 不能为空' }, 400);
  }

  const result = await db.insert(testCases).values({
    skill_name: body.skill_name,
    input_message: body.input_message,
    expected_keywords: JSON.stringify(body.expected_keywords),
    phone: body.phone ?? '13800000001',
  }).returning({ id: testCases.id });

  logger.info('test-cases', 'created', { id: result[0]?.id, skill: body.skill_name });
  return c.json({ ok: true, id: result[0]?.id });
});

// DELETE /api/test-cases/:id
testCaseRoutes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await db.delete(testCases).where(eq(testCases.id, id));
  logger.info('test-cases', 'deleted', { id });
  return c.json({ ok: true });
});

export default testCaseRoutes;
