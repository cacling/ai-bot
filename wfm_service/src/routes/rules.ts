/**
 * rules.ts — 规则定义/绑定/链 CRUD
 */
import { Hono } from 'hono';
import { db, eq, wfmRuleDefinitions, wfmRuleBindings, wfmRuleChains } from '../db';

const router = new Hono();

// ── 规则定义 CRUD ──

router.get('/definitions', async (c) => {
  const rows = db.select().from(wfmRuleDefinitions).all();
  return c.json({ items: rows });
});

router.post('/definitions', async (c) => {
  const body = await c.req.json();
  if (!body.code || !body.name) return c.json({ error: 'code 和 name 不能为空' }, 400);
  const [row] = db.insert(wfmRuleDefinitions).values({
    code: body.code,
    name: body.name,
    category: body.category ?? 'custom',
    stage: body.stage ?? 'edit_commit',
    scopeType: body.scopeType ?? 'global',
    severityDefault: body.severityDefault ?? 'warning',
    paramSchema: body.paramSchema ?? null,
  }).returning().all();
  return c.json(row, 201);
});

router.put('/definitions/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  db.update(wfmRuleDefinitions).set({
    ...(body.name !== undefined && { name: body.name }),
    ...(body.category !== undefined && { category: body.category }),
    ...(body.stage !== undefined && { stage: body.stage }),
    ...(body.scopeType !== undefined && { scopeType: body.scopeType }),
    ...(body.severityDefault !== undefined && { severityDefault: body.severityDefault }),
    ...(body.paramSchema !== undefined && { paramSchema: body.paramSchema }),
  }).where(eq(wfmRuleDefinitions.id, id)).run();

  const [updated] = db.select().from(wfmRuleDefinitions).where(eq(wfmRuleDefinitions.id, id)).all();
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json(updated);
});

// ── 规则绑定 CRUD ──

router.get('/bindings', async (c) => {
  const rows = db.select().from(wfmRuleBindings).all();
  return c.json({ items: rows });
});

router.post('/bindings', async (c) => {
  const body = await c.req.json();
  if (!body.definitionId) return c.json({ error: 'definitionId 不能为空' }, 400);
  const [row] = db.insert(wfmRuleBindings).values({
    definitionId: body.definitionId,
    scopeType: body.scopeType ?? 'global',
    scopeId: body.scopeId ?? null,
    priority: body.priority ?? 100,
    enabled: body.enabled ?? true,
    params: body.params ?? null,
  }).returning().all();
  return c.json(row, 201);
});

router.put('/bindings/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  db.update(wfmRuleBindings).set({
    ...(body.priority !== undefined && { priority: body.priority }),
    ...(body.enabled !== undefined && { enabled: body.enabled }),
    ...(body.params !== undefined && { params: body.params }),
  }).where(eq(wfmRuleBindings.id, id)).run();

  const [updated] = db.select().from(wfmRuleBindings).where(eq(wfmRuleBindings.id, id)).all();
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json(updated);
});

router.delete('/bindings/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(wfmRuleBindings).where(eq(wfmRuleBindings.id, id)).run();
  return c.json({ deleted: true });
});

// ── 规则链 CRUD ──

router.get('/chains', async (c) => {
  const rows = db.select().from(wfmRuleChains).all();
  return c.json({ items: rows });
});

router.post('/chains', async (c) => {
  const body = await c.req.json();
  if (!body.stage || !body.bindingId) return c.json({ error: 'stage 和 bindingId 不能为空' }, 400);
  const [row] = db.insert(wfmRuleChains).values({
    stage: body.stage,
    executionOrder: body.executionOrder ?? 1,
    bindingId: body.bindingId,
    stopOnError: body.stopOnError ?? false,
  }).returning().all();
  return c.json(row, 201);
});

router.delete('/chains/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(wfmRuleChains).where(eq(wfmRuleChains.id, id)).run();
  return c.json({ deleted: true });
});

export default router;
