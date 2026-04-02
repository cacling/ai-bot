/**
 * routing-mgmt.ts — Routing management API hub
 *
 * Aggregates all routing management sub-routes:
 *   /api/routing/stats/*    — Phase 1: Dashboard stats
 *   /api/routing/rules/*    — Phase 2: Route rule CRUD
 *   /api/routing/monitor/*  — Phase 4: Real-time monitor + manual ops
 *   /api/routing/logs/*     — Phase 5: Enhanced execution logs
 *   /api/routing/replay/*   — Phase 5: Replay task management
 *   /api/routing/audit/*    — Audit log query
 */
import { Hono } from 'hono';
import {
  db,
  ixInteractions,
  ixInteractionEvents,
  ixRoutingQueues,
  ixAgentPresence,
  ixRouteOperationAudit,
  ixRouteRules,
  ixRouteReplayTasks,
  ixPluginExecutionLogs,
  eq,
  and,
  desc,
  sql,
  count,
  inArray,
} from '../db';
import { writeAudit } from '../services/audit-logger';

const router = new Hono();

// ══════════════════════════════════════════════════════════════════════════════
// Phase 1: Stats — Dashboard metrics
// ══════════════════════════════════════════════════════════════════════════════

/** GET /stats/summary — Today's routing volume, success rate, avg wait, overflow rate */
router.get('/stats/summary', async (c) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartTs = Math.floor(todayStart.getTime() / 1000);

  // Total interactions created today
  const totalRows = await db.select({ cnt: count() }).from(ixInteractions)
    .where(sql`${ixInteractions.created_at} >= ${todayStartTs}`)
    .all();
  const totalToday = totalRows[0]?.cnt ?? 0;

  // Assigned (success) count
  const assignedRows = await db.select({ cnt: count() }).from(ixInteractions)
    .where(and(
      sql`${ixInteractions.created_at} >= ${todayStartTs}`,
      inArray(ixInteractions.state, ['assigned', 'active', 'wrapping_up', 'closed']),
    ))
    .all();
  const assignedCount = assignedRows[0]?.cnt ?? 0;

  // Overflow count from events
  const overflowRows = await db.select({ cnt: count() }).from(ixInteractionEvents)
    .where(and(
      eq(ixInteractionEvents.event_type, 'overflow'),
      sql`${ixInteractionEvents.created_at} >= ${todayStartTs}`,
    ))
    .all();
  const overflowCount = overflowRows[0]?.cnt ?? 0;

  // Average wait time (seconds): time from 'created' event to 'assigned' event
  const avgWaitRows = await db.all<{ avg_wait_sec: number | null }>(sql`
    SELECT AVG(
      (julianday(a.created_at, 'unixepoch') - julianday(c.created_at, 'unixepoch')) * 86400
    ) AS avg_wait_sec
    FROM ix_interaction_events a
    JOIN ix_interaction_events c ON a.interaction_id = c.interaction_id
    WHERE a.event_type = 'assigned'
      AND c.event_type = 'created'
      AND a.created_at >= ${Math.floor(todayStart.getTime() / 1000)}
  `);
  const avgWaitSec = avgWaitRows[0]?.avg_wait_sec ?? 0;

  // Currently queued count
  const queuedRows = await db.select({ cnt: count() }).from(ixInteractions)
    .where(eq(ixInteractions.state, 'queued'))
    .all();
  const currentQueued = queuedRows[0]?.cnt ?? 0;

  return c.json({
    total_today: totalToday,
    assigned_count: assignedCount,
    success_rate: totalToday > 0 ? Math.round((assignedCount / totalToday) * 10000) / 100 : 0,
    avg_wait_seconds: Math.round(avgWaitSec * 100) / 100,
    overflow_count: overflowCount,
    current_queued: currentQueued,
  });
});

/** GET /stats/queue-load — Per-queue current load */
router.get('/stats/queue-load', async (c) => {
  // All active queues
  const queues = await db.select().from(ixRoutingQueues).all();

  // Count interactions by queue and state
  const loadRows = await db.all<{ queue_code: string; state: string; cnt: number }>(sql`
    SELECT queue_code, state, COUNT(*) AS cnt
    FROM ix_interactions
    WHERE state IN ('created', 'queued', 'offered', 'assigned', 'active')
      AND queue_code IS NOT NULL
    GROUP BY queue_code, state
  `);

  const loadMap = new Map<string, Record<string, number>>();
  for (const row of loadRows) {
    if (!loadMap.has(row.queue_code)) loadMap.set(row.queue_code, {});
    loadMap.get(row.queue_code)![row.state] = row.cnt;
  }

  const items = queues.map((q) => {
    const load = loadMap.get(q.queue_code) ?? {};
    return {
      queue_code: q.queue_code,
      display_name_zh: q.display_name_zh,
      work_model: q.work_model,
      status: q.status,
      pending: (load.created ?? 0) + (load.queued ?? 0),
      offered: load.offered ?? 0,
      assigned: (load.assigned ?? 0) + (load.active ?? 0),
      max_wait_seconds: q.max_wait_seconds,
      overflow_queue: q.overflow_queue,
    };
  });

  return c.json({ items });
});

/** GET /stats/agent-capacity — Online agent capacity snapshot */
router.get('/stats/agent-capacity', async (c) => {
  const agents = await db.select().from(ixAgentPresence).all();

  const online = agents.filter((a) => a.presence_status === 'online');
  const totalChatSlots = online.reduce((s, a) => s + a.max_chat_slots, 0);
  const usedChatSlots = online.reduce((s, a) => s + a.active_chat_count, 0);
  const totalVoiceSlots = online.reduce((s, a) => s + a.max_voice_slots, 0);
  const usedVoiceSlots = online.reduce((s, a) => s + a.active_voice_count, 0);

  return c.json({
    online_count: online.length,
    total_count: agents.length,
    chat: {
      total_slots: totalChatSlots,
      used_slots: usedChatSlots,
      utilization: totalChatSlots > 0 ? Math.round((usedChatSlots / totalChatSlots) * 10000) / 100 : 0,
    },
    voice: {
      total_slots: totalVoiceSlots,
      used_slots: usedVoiceSlots,
      utilization: totalVoiceSlots > 0 ? Math.round((usedVoiceSlots / totalVoiceSlots) * 10000) / 100 : 0,
    },
    agents: online.map((a) => ({
      agent_id: a.agent_id,
      active_chat: a.active_chat_count,
      max_chat: a.max_chat_slots,
      active_voice: a.active_voice_count,
      max_voice: a.max_voice_slots,
    })),
  });
});

/** GET /stats/slow-routing — Top N slowest routing decisions today */
router.get('/stats/slow-routing', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 10), 50);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const rows = await db.all<{
    interaction_id: string;
    queue_code: string | null;
    work_model: string;
    wait_seconds: number;
    assigned_agent_id: string | null;
  }>(sql`
    SELECT
      i.interaction_id,
      i.queue_code,
      i.work_model,
      i.assigned_agent_id,
      (julianday(a.created_at, 'unixepoch') - julianday(c.created_at, 'unixepoch')) * 86400 AS wait_seconds
    FROM ix_interaction_events a
    JOIN ix_interaction_events c ON a.interaction_id = c.interaction_id
    JOIN ix_interactions i ON i.interaction_id = a.interaction_id
    WHERE a.event_type = 'assigned'
      AND c.event_type = 'created'
      AND a.created_at >= ${Math.floor(todayStart.getTime() / 1000)}
    ORDER BY wait_seconds DESC
    LIMIT ${limit}
  `);

  return c.json({ items: rows });
});

// ══════════════════════════════════════════════════════════════════════════════
// Phase 2: Route Rules CRUD
// ══════════════════════════════════════════════════════════════════════════════

/** GET /rules — List route rules */
router.get('/rules', async (c) => {
  const enabled = c.req.query('enabled');
  const queueCode = c.req.query('queue_code');

  let query = db.select().from(ixRouteRules).$dynamic();
  if (enabled !== undefined) query = query.where(eq(ixRouteRules.enabled, enabled === 'true'));
  if (queueCode) query = query.where(eq(ixRouteRules.queue_code, queueCode));

  const rows = await query.orderBy(ixRouteRules.priority_order).all();
  return c.json({ items: rows });
});

/** POST /rules — Create a route rule */
router.post('/rules', async (c) => {
  const body = await c.req.json<{
    rule_name: string;
    rule_type: string;
    queue_code: string;
    condition_json?: string;
    action_json?: string;
    priority_order?: number;
    grayscale_pct?: number;
    effective_from?: string;
    effective_to?: string;
    created_by?: string;
  }>();

  if (!body.rule_name || !body.rule_type || !body.queue_code) {
    return c.json({ error: 'rule_name, rule_type, and queue_code are required' }, 400);
  }

  const ruleId = crypto.randomUUID();
  const values = {
    rule_id: ruleId,
    rule_name: body.rule_name,
    rule_type: body.rule_type,
    queue_code: body.queue_code,
    condition_json: body.condition_json ?? null,
    action_json: body.action_json ?? null,
    priority_order: body.priority_order ?? 0,
    grayscale_pct: body.grayscale_pct ?? 100,
    effective_from: body.effective_from ? new Date(body.effective_from) : null,
    effective_to: body.effective_to ? new Date(body.effective_to) : null,
    created_by: body.created_by ?? null,
  };

  await db.insert(ixRouteRules).values(values);

  await writeAudit({
    operator_id: body.created_by,
    operation_type: 'rule_create',
    target_type: 'route_rule',
    target_id: ruleId,
    after_snapshot: values,
  });

  const row = await db.query.ixRouteRules.findFirst({
    where: eq(ixRouteRules.rule_id, ruleId),
  });
  return c.json(row, 201);
});

/** GET /rules/:id — Get rule detail */
router.get('/rules/:id', async (c) => {
  const row = await db.query.ixRouteRules.findFirst({
    where: eq(ixRouteRules.rule_id, c.req.param('id')),
  });
  if (!row) return c.json({ error: 'Rule not found' }, 404);
  return c.json(row);
});

/** PUT /rules/:id — Update a rule */
router.put('/rules/:id', async (c) => {
  const ruleId = c.req.param('id');
  const existing = await db.query.ixRouteRules.findFirst({
    where: eq(ixRouteRules.rule_id, ruleId),
  });
  if (!existing) return c.json({ error: 'Rule not found' }, 404);

  const body = await c.req.json<Record<string, unknown>>();
  const allowed = ['rule_name', 'rule_type', 'queue_code', 'condition_json', 'action_json', 'priority_order', 'grayscale_pct', 'enabled', 'effective_from', 'effective_to'];
  const updates: Record<string, unknown> = { updated_at: new Date() };
  for (const key of allowed) {
    if (key in body) {
      if ((key === 'effective_from' || key === 'effective_to') && body[key]) {
        updates[key] = new Date(body[key] as string);
      } else {
        updates[key] = body[key];
      }
    }
  }

  await db.update(ixRouteRules).set(updates).where(eq(ixRouteRules.rule_id, ruleId));

  await writeAudit({
    operator_id: body.operator_id as string | undefined,
    operation_type: 'rule_update',
    target_type: 'route_rule',
    target_id: ruleId,
    before_snapshot: existing,
    after_snapshot: updates,
  });

  const row = await db.query.ixRouteRules.findFirst({
    where: eq(ixRouteRules.rule_id, ruleId),
  });
  return c.json(row);
});

/** DELETE /rules/:id — Soft-disable a rule */
router.delete('/rules/:id', async (c) => {
  const ruleId = c.req.param('id');
  const existing = await db.query.ixRouteRules.findFirst({
    where: eq(ixRouteRules.rule_id, ruleId),
  });
  if (!existing) return c.json({ error: 'Rule not found' }, 404);

  await db.update(ixRouteRules)
    .set({ enabled: false, updated_at: new Date() })
    .where(eq(ixRouteRules.rule_id, ruleId));

  await writeAudit({
    operation_type: 'rule_delete',
    target_type: 'route_rule',
    target_id: ruleId,
    before_snapshot: existing,
  });

  return c.json({ ok: true });
});

/** PUT /rules/:id/toggle — Toggle enabled/grayscale */
router.put('/rules/:id/toggle', async (c) => {
  const ruleId = c.req.param('id');
  const existing = await db.query.ixRouteRules.findFirst({
    where: eq(ixRouteRules.rule_id, ruleId),
  });
  if (!existing) return c.json({ error: 'Rule not found' }, 404);

  const body = await c.req.json<{ enabled?: boolean; grayscale_pct?: number }>();
  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.grayscale_pct !== undefined) updates.grayscale_pct = body.grayscale_pct;

  await db.update(ixRouteRules).set(updates).where(eq(ixRouteRules.rule_id, ruleId));

  await writeAudit({
    operation_type: 'rule_update',
    target_type: 'route_rule',
    target_id: ruleId,
    before_snapshot: { enabled: existing.enabled, grayscale_pct: existing.grayscale_pct },
    after_snapshot: updates,
  });

  return c.json({ ok: true });
});

/** POST /rules/reorder — Batch update priority_order */
router.post('/rules/reorder', async (c) => {
  const body = await c.req.json<{ order: { rule_id: string; priority_order: number }[] }>();
  if (!body.order?.length) return c.json({ error: 'order array is required' }, 400);

  for (const item of body.order) {
    await db.update(ixRouteRules)
      .set({ priority_order: item.priority_order, updated_at: new Date() })
      .where(eq(ixRouteRules.rule_id, item.rule_id));
  }

  await writeAudit({
    operation_type: 'rule_update',
    target_type: 'route_rule',
    target_id: 'batch_reorder',
    after_snapshot: body.order,
  });

  return c.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// Phase 4: Real-time Routing Monitor
// ══════════════════════════════════════════════════════════════════════════════

/** GET /monitor/live — Current active interactions */
router.get('/monitor/live', async (c) => {
  const queueCode = c.req.query('queue_code');
  const limit = Math.min(Number(c.req.query('limit') ?? 100), 500);

  const rows = await db.all<{
    interaction_id: string;
    conversation_id: string;
    work_model: string;
    queue_code: string | null;
    priority: number;
    state: string;
    assigned_agent_id: string | null;
    routing_mode: string;
    created_at: number;
  }>(sql`
    SELECT interaction_id, conversation_id, work_model, queue_code, priority,
           state, assigned_agent_id, routing_mode, created_at
    FROM ix_interactions
    WHERE state IN ('created', 'queued', 'offered', 'assigned', 'active')
    ${queueCode ? sql`AND queue_code = ${queueCode}` : sql``}
    ORDER BY priority ASC, created_at ASC
    LIMIT ${limit}
  `);

  const now = Math.floor(Date.now() / 1000);
  const items = rows.map((r) => ({
    ...r,
    wait_seconds: now - r.created_at,
  }));

  return c.json({ items });
});

/** POST /monitor/retry/:id — Manual retry routing */
router.post('/monitor/retry/:id', async (c) => {
  const interactionId = c.req.param('id');
  const interaction = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, interactionId),
  });
  if (!interaction) return c.json({ error: 'Interaction not found' }, 404);
  if (interaction.state !== 'queued' && interaction.state !== 'created') {
    return c.json({ error: `Cannot retry in state '${interaction.state}'` }, 400);
  }

  // Import and call routeInteraction
  const { routeInteraction } = await import('../services/router-kernel');
  const result = await routeInteraction(interactionId);

  const body = await c.req.json<{ operator_id?: string }>().catch(() => ({} as { operator_id?: string }));
  await writeAudit({
    operator_id: body.operator_id,
    operation_type: 'manual_retry',
    target_type: 'interaction',
    target_id: interactionId,
    after_snapshot: result,
  });

  return c.json(result);
});

/** POST /monitor/reassign/:id — Manual queue reassignment */
router.post('/monitor/reassign/:id', async (c) => {
  const interactionId = c.req.param('id');
  const body = await c.req.json<{ queue_code: string; operator_id?: string }>();
  if (!body.queue_code) return c.json({ error: 'queue_code is required' }, 400);

  const interaction = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, interactionId),
  });
  if (!interaction) return c.json({ error: 'Interaction not found' }, 404);

  const oldQueue = interaction.queue_code;
  await db.update(ixInteractions)
    .set({ queue_code: body.queue_code, state: 'queued', updated_at: new Date() })
    .where(eq(ixInteractions.interaction_id, interactionId));

  await db.insert(ixInteractionEvents).values({
    interaction_id: interactionId,
    event_type: 'manual_reassign',
    actor_type: 'agent',
    actor_id: body.operator_id ?? null,
    from_state: interaction.state,
    to_state: 'queued',
    payload_json: JSON.stringify({ from_queue: oldQueue, to_queue: body.queue_code }),
  });

  await writeAudit({
    operator_id: body.operator_id,
    operation_type: 'manual_transfer',
    target_type: 'interaction',
    target_id: interactionId,
    before_snapshot: { queue_code: oldQueue, state: interaction.state },
    after_snapshot: { queue_code: body.queue_code, state: 'queued' },
  });

  // Re-route in new queue
  const { routeInteraction } = await import('../services/router-kernel');
  const result = await routeInteraction(interactionId);
  return c.json(result);
});

/** POST /monitor/force-assign/:id — Force assign to specific agent */
router.post('/monitor/force-assign/:id', async (c) => {
  const interactionId = c.req.param('id');
  const body = await c.req.json<{ agent_id: string; operator_id?: string }>();
  if (!body.agent_id) return c.json({ error: 'agent_id is required' }, 400);

  const interaction = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, interactionId),
  });
  if (!interaction) return c.json({ error: 'Interaction not found' }, 404);

  const assignmentId = crypto.randomUUID();
  const now = new Date();

  await db.update(ixInteractions)
    .set({
      state: 'assigned',
      assigned_agent_id: body.agent_id,
      routing_mode: 'direct_assign',
      updated_at: now,
    })
    .where(eq(ixInteractions.interaction_id, interactionId));

  const { ixAssignments } = await import('../db');
  await db.insert(ixAssignments).values({
    assignment_id: assignmentId,
    interaction_id: interactionId,
    agent_id: body.agent_id,
    assignment_type: 'primary',
  });

  await db.insert(ixInteractionEvents).values({
    interaction_id: interactionId,
    event_type: 'force_assigned',
    actor_type: 'agent',
    actor_id: body.operator_id ?? null,
    from_state: interaction.state,
    to_state: 'assigned',
    payload_json: JSON.stringify({ agent_id: body.agent_id, assignment_id: assignmentId, forced: true }),
  });

  await writeAudit({
    operator_id: body.operator_id,
    operation_type: 'manual_assign',
    target_type: 'interaction',
    target_id: interactionId,
    after_snapshot: { agent_id: body.agent_id, assignment_id: assignmentId },
  });

  return c.json({ success: true, assigned_agent_id: body.agent_id, assignment_id: assignmentId });
});

// ══════════════════════════════════════════════════════════════════════════════
// Phase 5: Enhanced Execution Logs & Replay
// ══════════════════════════════════════════════════════════════════════════════

/** GET /logs — Enhanced execution logs query with pagination */
router.get('/logs', async (c) => {
  const interactionId = c.req.query('interaction_id');
  const pluginId = c.req.query('plugin_id');
  const slot = c.req.query('slot');
  const status = c.req.query('status');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const offset = Number(c.req.query('offset') ?? 0);

  let query = db.select().from(ixPluginExecutionLogs).$dynamic();
  if (interactionId) query = query.where(eq(ixPluginExecutionLogs.interaction_id, interactionId));
  if (pluginId) query = query.where(eq(ixPluginExecutionLogs.plugin_id, pluginId));
  if (slot) query = query.where(eq(ixPluginExecutionLogs.slot, slot));
  if (status) query = query.where(eq(ixPluginExecutionLogs.status, status));

  const rows = await query.orderBy(desc(ixPluginExecutionLogs.created_at)).limit(limit).offset(offset).all();

  // Strip large snapshots from list view
  const items = rows.map((r) => ({
    ...r,
    input_snapshot_json: r.input_snapshot_json ? '...' : null,
    output_snapshot_json: r.output_snapshot_json ? '...' : null,
  }));

  return c.json({ items, offset, limit });
});

/** GET /logs/:logId/snapshots — Full input/output snapshots for a log entry */
router.get('/logs/:logId/snapshots', async (c) => {
  const logId = Number(c.req.param('logId'));
  const rows = await db.select({
    input_snapshot_json: ixPluginExecutionLogs.input_snapshot_json,
    output_snapshot_json: ixPluginExecutionLogs.output_snapshot_json,
  }).from(ixPluginExecutionLogs)
    .where(eq(ixPluginExecutionLogs.log_id, logId))
    .all();

  if (rows.length === 0) return c.json({ error: 'Log not found' }, 404);
  const row = rows[0];
  return c.json({
    input: row.input_snapshot_json ? JSON.parse(row.input_snapshot_json) : null,
    output: row.output_snapshot_json ? JSON.parse(row.output_snapshot_json) : null,
  });
});

/** POST /replay/single — Single interaction replay */
router.post('/replay/single', async (c) => {
  const body = await c.req.json<{ interaction_id: string; override_queue_code?: string }>();
  if (!body.interaction_id) return c.json({ error: 'interaction_id is required' }, 400);

  const { replayRouting } = await import('../services/replay-engine');
  const result = await replayRouting({
    interaction_id: body.interaction_id,
    override_queue_code: body.override_queue_code,
  });

  return c.json(result);
});

/** POST /replay/task — Create a batch replay task */
router.post('/replay/task', async (c) => {
  const body = await c.req.json<{
    task_name?: string;
    interaction_ids: string[];
    override_queue_code?: string;
    created_by?: string;
  }>();

  if (!body.interaction_ids?.length) return c.json({ error: 'interaction_ids array is required' }, 400);
  if (body.interaction_ids.length > 100) return c.json({ error: 'Max 100 interactions per batch' }, 400);

  const taskId = crypto.randomUUID();
  await db.insert(ixRouteReplayTasks).values({
    task_id: taskId,
    task_name: body.task_name ?? `Replay ${new Date().toISOString()}`,
    interaction_ids_json: JSON.stringify(body.interaction_ids),
    override_queue_code: body.override_queue_code ?? null,
    total_count: body.interaction_ids.length,
    created_by: body.created_by ?? null,
  });

  await writeAudit({
    operator_id: body.created_by,
    operation_type: 'replay_trigger',
    target_type: 'replay_task',
    target_id: taskId,
    after_snapshot: { interaction_count: body.interaction_ids.length },
  });

  // Run replay in background
  (async () => {
    try {
      await db.update(ixRouteReplayTasks)
        .set({ status: 'running', started_at: new Date() })
        .where(eq(ixRouteReplayTasks.task_id, taskId));

      const { batchReplay } = await import('../services/replay-engine');
      const result = await batchReplay(body.interaction_ids, body.override_queue_code);

      await db.update(ixRouteReplayTasks)
        .set({
          status: 'completed',
          completed_count: result.total,
          divergence_count: result.divergence_count,
          results_json: JSON.stringify(result.results.map((r) => ({
            interaction_id: r.interaction_id,
            divergence: r.divergence,
            divergence_summary: r.divergence_summary,
            original_agent: r.original.assigned_agent_id,
            replayed_agent: r.replayed.would_assign,
          }))),
          completed_at: new Date(),
        })
        .where(eq(ixRouteReplayTasks.task_id, taskId));
    } catch (err) {
      await db.update(ixRouteReplayTasks)
        .set({ status: 'failed', error_message: String(err), completed_at: new Date() })
        .where(eq(ixRouteReplayTasks.task_id, taskId));
    }
  })();

  return c.json({ task_id: taskId }, 201);
});

/** GET /replay/tasks — List replay tasks */
router.get('/replay/tasks', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100);
  const rows = await db.select().from(ixRouteReplayTasks)
    .orderBy(desc(ixRouteReplayTasks.created_at))
    .limit(limit)
    .all();
  return c.json({ items: rows });
});

/** GET /replay/tasks/:taskId — Replay task detail */
router.get('/replay/tasks/:taskId', async (c) => {
  const row = await db.query.ixRouteReplayTasks.findFirst({
    where: eq(ixRouteReplayTasks.task_id, c.req.param('taskId')),
  });
  if (!row) return c.json({ error: 'Task not found' }, 404);
  return c.json(row);
});

// ══════════════════════════════════════════════════════════════════════════════
// Audit log query
// ══════════════════════════════════════════════════════════════════════════════

/** GET /audit — Query operation audit logs */
router.get('/audit', async (c) => {
  const operationType = c.req.query('operation_type');
  const targetType = c.req.query('target_type');
  const targetId = c.req.query('target_id');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);

  let query = db.select().from(ixRouteOperationAudit).$dynamic();
  if (operationType) query = query.where(eq(ixRouteOperationAudit.operation_type, operationType));
  if (targetType) query = query.where(eq(ixRouteOperationAudit.target_type, targetType));
  if (targetId) query = query.where(eq(ixRouteOperationAudit.target_id, targetId));

  const rows = await query.orderBy(desc(ixRouteOperationAudit.created_at)).limit(limit).all();
  return c.json({ items: rows });
});

export default router;
