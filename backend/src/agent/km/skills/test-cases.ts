/**
 * test-cases.ts — 回归测试用例管理
 *
 * GET    /api/test-cases?skill=xxx   — 获取用例列表
 * POST   /api/test-cases             — 新增测试用例（支持 assertions 新格式）
 * POST   /api/test-cases/batch       — 批量新增（技能创建器生成的用例）
 * PUT    /api/test-cases/:id         — 更新用例
 * DELETE /api/test-cases/:id         — 删除用例
 */

import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../../db';
import { testCases } from '../../../db/schema';
import { logger } from '../../../logger';

const testCaseRoutes = new Hono();

// GET /api/test-cases?skill=xxx
testCaseRoutes.get('/', async (c) => {
  const skill = c.req.query('skill');
  const rows = skill
    ? await db.select().from(testCases).where(eq(testCases.skill_name, skill)).orderBy(desc(testCases.created_at))
    : await db.select().from(testCases).orderBy(desc(testCases.created_at));

  // 返回时解析 JSON 字段
  return c.json(rows.map(r => ({
    ...r,
    expected_keywords: JSON.parse(r.expected_keywords),
    assertions: r.assertions ? JSON.parse(r.assertions) : null,
  })));
});

// POST /api/test-cases
testCaseRoutes.post('/', async (c) => {
  const body = await c.req.json<{
    skill_name?: string;
    input_message?: string;
    expected_keywords?: string[];
    assertions?: Array<{ type: string; value: string }>;
    phone?: string;
  }>();

  if (!body.skill_name || !body.input_message) {
    return c.json({ error: 'skill_name 和 input_message 不能为空' }, 400);
  }

  // 至少提供 expected_keywords 或 assertions 之一
  if (!body.expected_keywords?.length && !body.assertions?.length) {
    return c.json({ error: '至少提供 expected_keywords 或 assertions' }, 400);
  }

  // 如果只提供了 assertions，从 contains 类型中提取 expected_keywords（向后兼容）
  const keywords = body.expected_keywords?.length
    ? body.expected_keywords
    : (body.assertions ?? []).filter(a => a.type === 'contains').map(a => a.value);

  const result = await db.insert(testCases).values({
    skill_name: body.skill_name,
    input_message: body.input_message,
    expected_keywords: JSON.stringify(keywords.length ? keywords : ['_placeholder_']),
    assertions: body.assertions ? JSON.stringify(body.assertions) : null,
    phone: body.phone ?? '13800000001',
  }).returning({ id: testCases.id });

  logger.info('test-cases', 'created', { id: result[0]?.id, skill: body.skill_name });
  return c.json({ ok: true, id: result[0]?.id });
});

// POST /api/test-cases/batch — 批量新增（技能创建器使用）
testCaseRoutes.post('/batch', async (c) => {
  const body = await c.req.json<{
    skill_name: string;
    cases: Array<{
      input: string;
      assertions: Array<{ type: string; value: string }>;
      phone?: string;
    }>;
  }>();

  if (!body.skill_name || !body.cases?.length) {
    return c.json({ error: 'skill_name 和 cases 不能为空' }, 400);
  }

  const ids: number[] = [];
  for (const tc of body.cases) {
    const keywords = tc.assertions.filter(a => a.type === 'contains').map(a => a.value);
    const result = await db.insert(testCases).values({
      skill_name: body.skill_name,
      input_message: tc.input,
      expected_keywords: JSON.stringify(keywords.length ? keywords : ['_placeholder_']),
      assertions: JSON.stringify(tc.assertions),
      phone: tc.phone ?? '13800000001',
    }).returning({ id: testCases.id });
    if (result[0]) ids.push(result[0].id);
  }

  logger.info('test-cases', 'batch_created', { skill: body.skill_name, count: ids.length });
  return c.json({ ok: true, ids, count: ids.length });
});

// PUT /api/test-cases/:id
testCaseRoutes.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json<{
    input_message?: string;
    expected_keywords?: string[];
    assertions?: Array<{ type: string; value: string }>;
    phone?: string;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.input_message) updates.input_message = body.input_message;
  if (body.expected_keywords) updates.expected_keywords = JSON.stringify(body.expected_keywords);
  if (body.assertions) updates.assertions = JSON.stringify(body.assertions);
  if (body.phone) updates.phone = body.phone;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: '没有可更新的字段' }, 400);
  }

  await db.update(testCases).set(updates).where(eq(testCases.id, id));
  logger.info('test-cases', 'updated', { id });
  return c.json({ ok: true });
});

// DELETE /api/test-cases/:id
testCaseRoutes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await db.delete(testCases).where(eq(testCases.id, id));
  logger.info('test-cases', 'deleted', { id });
  return c.json({ ok: true });
});

export default testCaseRoutes;
