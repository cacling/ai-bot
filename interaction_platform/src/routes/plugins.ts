/**
 * plugins.ts — Plugin catalog + binding CRUD + execution logs + replay API
 *
 * Plugin management:
 *   GET    /api/plugins/catalog               — List all plugins
 *   POST   /api/plugins/catalog               — Register a plugin
 *   GET    /api/plugins/catalog/:id           — Get plugin detail
 *   PUT    /api/plugins/catalog/:id           — Update a plugin
 *   DELETE /api/plugins/catalog/:id           — Disable a plugin
 *
 * Binding management:
 *   GET    /api/plugins/bindings              — List bindings (by queue)
 *   POST   /api/plugins/bindings              — Create a binding
 *   PUT    /api/plugins/bindings/:id          — Update a binding
 *   DELETE /api/plugins/bindings/:id          — Remove a binding
 *
 * Execution & debugging:
 *   GET    /api/plugins/logs                  — Query execution logs
 *   POST   /api/plugins/replay               — Replay a routing decision
 *   POST   /api/plugins/replay/batch          — Batch replay
 */
import { Hono } from 'hono';
import {
  db,
  ixPluginCatalog,
  ixPluginBindings,
  ixPluginExecutionLogs,
  eq,
  and,
  desc,
} from '../db';
import { replayRouting, batchReplay } from '../services/replay-engine';

const router = new Hono();

// ══════════════════════════════════════════════════════════════════════════════
// Plugin Catalog
// ══════════════════════════════════════════════════════════════════════════════

/** GET /catalog — List all plugins */
router.get('/catalog', async (c) => {
  const pluginType = c.req.query('type');
  const status = c.req.query('status');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);

  const conditions = [];
  if (pluginType) conditions.push(eq(ixPluginCatalog.plugin_type, pluginType));
  if (status) conditions.push(eq(ixPluginCatalog.status, status));

  let query = db.select().from(ixPluginCatalog).$dynamic();
  if (conditions.length) query = query.where(and(...conditions));

  const rows = await query.orderBy(desc(ixPluginCatalog.created_at)).limit(limit).all();
  return c.json({ items: rows });
});

/** POST /catalog — Register a new plugin */
router.post('/catalog', async (c) => {
  const body = await c.req.json<{
    name: string;
    display_name_zh: string;
    display_name_en: string;
    description?: string;
    plugin_type: string;
    handler_module: string;
    config_schema_json?: string;
    default_config_json?: string;
    timeout_ms?: number;
    fallback_behavior?: string;
  }>();

  if (!body.name || !body.plugin_type || !body.handler_module) {
    return c.json({ error: 'name, plugin_type, and handler_module are required' }, 400);
  }

  const pluginId = crypto.randomUUID();
  await db.insert(ixPluginCatalog).values({
    plugin_id: pluginId,
    name: body.name,
    display_name_zh: body.display_name_zh ?? body.name,
    display_name_en: body.display_name_en ?? body.name,
    description: body.description ?? null,
    plugin_type: body.plugin_type,
    handler_module: body.handler_module,
    config_schema_json: body.config_schema_json ?? null,
    default_config_json: body.default_config_json ?? null,
    timeout_ms: body.timeout_ms ?? 3000,
    fallback_behavior: body.fallback_behavior ?? 'use_core',
  });

  return c.json({ plugin_id: pluginId }, 201);
});

/** GET /catalog/:id — Get plugin detail */
router.get('/catalog/:id', async (c) => {
  const plugin = await db.query.ixPluginCatalog.findFirst({
    where: eq(ixPluginCatalog.plugin_id, c.req.param('id')),
  });
  if (!plugin) return c.json({ error: 'Plugin not found' }, 404);

  // Include bindings
  const bindings = await db.select().from(ixPluginBindings)
    .where(eq(ixPluginBindings.plugin_id, plugin.plugin_id))
    .all();

  return c.json({ ...plugin, bindings });
});

/** PUT /catalog/:id — Update a plugin */
router.put('/catalog/:id', async (c) => {
  const pluginId = c.req.param('id');
  const body = await c.req.json<{
    display_name_zh?: string;
    display_name_en?: string;
    description?: string;
    config_schema_json?: string;
    default_config_json?: string;
    timeout_ms?: number;
    fallback_behavior?: string;
    status?: string;
    version?: string;
  }>();

  const existing = await db.query.ixPluginCatalog.findFirst({
    where: eq(ixPluginCatalog.plugin_id, pluginId),
  });
  if (!existing) return c.json({ error: 'Plugin not found' }, 404);

  await db.update(ixPluginCatalog).set({
    ...(body.display_name_zh !== undefined && { display_name_zh: body.display_name_zh }),
    ...(body.display_name_en !== undefined && { display_name_en: body.display_name_en }),
    ...(body.description !== undefined && { description: body.description }),
    ...(body.config_schema_json !== undefined && { config_schema_json: body.config_schema_json }),
    ...(body.default_config_json !== undefined && { default_config_json: body.default_config_json }),
    ...(body.timeout_ms !== undefined && { timeout_ms: body.timeout_ms }),
    ...(body.fallback_behavior !== undefined && { fallback_behavior: body.fallback_behavior }),
    ...(body.status !== undefined && { status: body.status }),
    ...(body.version !== undefined && { version: body.version }),
    updated_at: new Date(),
  }).where(eq(ixPluginCatalog.plugin_id, pluginId));

  return c.json({ ok: true });
});

/** DELETE /catalog/:id — Disable a plugin (soft delete) */
router.delete('/catalog/:id', async (c) => {
  const pluginId = c.req.param('id');
  await db.update(ixPluginCatalog)
    .set({ status: 'disabled', updated_at: new Date() })
    .where(eq(ixPluginCatalog.plugin_id, pluginId));

  return c.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// Plugin Bindings
// ══════════════════════════════════════════════════════════════════════════════

/** GET /bindings — List bindings (filter by queue_code, plugin_id, slot) */
router.get('/bindings', async (c) => {
  const queueCode = c.req.query('queue_code');
  const pluginId = c.req.query('plugin_id');
  const slot = c.req.query('slot');

  const conditions = [];
  if (queueCode) conditions.push(eq(ixPluginBindings.queue_code, queueCode));
  if (pluginId) conditions.push(eq(ixPluginBindings.plugin_id, pluginId));
  if (slot) conditions.push(eq(ixPluginBindings.slot, slot));

  let query = db.select().from(ixPluginBindings).$dynamic();
  if (conditions.length) query = query.where(and(...conditions));

  const rows = await query.orderBy(ixPluginBindings.queue_code, ixPluginBindings.slot, ixPluginBindings.priority_order).all();
  return c.json({ items: rows });
});

/** POST /bindings — Create a binding */
router.post('/bindings', async (c) => {
  const body = await c.req.json<{
    queue_code: string;
    plugin_id: string;
    slot: string;
    priority_order?: number;
    enabled?: boolean;
    config_override_json?: string;
    shadow_mode?: boolean;
  }>();

  if (!body.queue_code || !body.plugin_id || !body.slot) {
    return c.json({ error: 'queue_code, plugin_id, and slot are required' }, 400);
  }

  const bindingId = crypto.randomUUID();
  await db.insert(ixPluginBindings).values({
    binding_id: bindingId,
    queue_code: body.queue_code,
    plugin_id: body.plugin_id,
    slot: body.slot,
    priority_order: body.priority_order ?? 0,
    enabled: body.enabled ?? true,
    config_override_json: body.config_override_json ?? null,
    shadow_mode: body.shadow_mode ?? false,
  });

  return c.json({ binding_id: bindingId }, 201);
});

/** PUT /bindings/:id — Update a binding */
router.put('/bindings/:id', async (c) => {
  const bindingId = c.req.param('id');
  const body = await c.req.json<{
    priority_order?: number;
    enabled?: boolean;
    config_override_json?: string;
    shadow_mode?: boolean;
  }>();

  const existing = await db.query.ixPluginBindings.findFirst({
    where: eq(ixPluginBindings.binding_id, bindingId),
  });
  if (!existing) return c.json({ error: 'Binding not found' }, 404);

  await db.update(ixPluginBindings).set({
    ...(body.priority_order !== undefined && { priority_order: body.priority_order }),
    ...(body.enabled !== undefined && { enabled: body.enabled }),
    ...(body.config_override_json !== undefined && { config_override_json: body.config_override_json }),
    ...(body.shadow_mode !== undefined && { shadow_mode: body.shadow_mode }),
  }).where(eq(ixPluginBindings.binding_id, bindingId));

  return c.json({ ok: true });
});

/** DELETE /bindings/:id — Remove a binding */
router.delete('/bindings/:id', async (c) => {
  const bindingId = c.req.param('id');
  // Use Drizzle delete
  await db.delete(ixPluginBindings).where(eq(ixPluginBindings.binding_id, bindingId));
  return c.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// Execution Logs & Replay
// ══════════════════════════════════════════════════════════════════════════════

/** GET /logs — Query plugin execution logs */
router.get('/logs', async (c) => {
  const interactionId = c.req.query('interaction_id');
  const pluginId = c.req.query('plugin_id');
  const slot = c.req.query('slot');
  const status = c.req.query('status');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);

  const conditions = [];
  if (interactionId) conditions.push(eq(ixPluginExecutionLogs.interaction_id, interactionId));
  if (pluginId) conditions.push(eq(ixPluginExecutionLogs.plugin_id, pluginId));
  if (slot) conditions.push(eq(ixPluginExecutionLogs.slot, slot));
  if (status) conditions.push(eq(ixPluginExecutionLogs.status, status));

  let query = db.select().from(ixPluginExecutionLogs).$dynamic();
  if (conditions.length) query = query.where(and(...conditions));

  const rows = await query.orderBy(desc(ixPluginExecutionLogs.created_at)).limit(limit).all();
  return c.json({ items: rows });
});

/** POST /replay — Replay a single routing decision */
router.post('/replay', async (c) => {
  const body = await c.req.json<{
    interaction_id: string;
    override_queue_code?: string;
  }>();

  if (!body.interaction_id) return c.json({ error: 'interaction_id is required' }, 400);

  const result = await replayRouting({
    interaction_id: body.interaction_id,
    override_queue_code: body.override_queue_code,
  });

  return c.json(result);
});

/** POST /replay/batch — Batch replay routing decisions */
router.post('/replay/batch', async (c) => {
  const body = await c.req.json<{
    interaction_ids: string[];
    override_queue_code?: string;
  }>();

  if (!body.interaction_ids?.length) return c.json({ error: 'interaction_ids array is required' }, 400);
  if (body.interaction_ids.length > 100) return c.json({ error: 'Max 100 interactions per batch' }, 400);

  const result = await batchReplay(body.interaction_ids, body.override_queue_code);
  return c.json(result);
});

export default router;
