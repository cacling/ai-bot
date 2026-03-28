/**
 * work-orders.ts — Work Order 路由（§7.3）
 */
import { Hono } from "hono";
import { db, workItems, workOrders, eq, and, desc } from "../db.js";
import { createWorkItem } from "../services/item-service.js";
import { transitionWorkOrder } from "../services/transition-service.js";
import { createAppointment } from "../services/appointment-service.js";
import { getAvailableWorkOrderActions } from "../policies/transition-policy.js";
import type { WorkItemStatus, WorkOrderAction } from "../types.js";

const app = new Hono();

/** GET / — 列出工单 */
app.get("/", async (c) => {
  const q = c.req.query();
  const page = q.page ? Number(q.page) : 1;
  const size = q.size ? Number(q.size) : 20;
  const offset = (page - 1) * size;

  const conditions = [eq(workItems.type, 'work_order')];
  if (q.status) conditions.push(eq(workItems.status, q.status));
  if (q.queue_code) conditions.push(eq(workItems.queue_code, q.queue_code));
  if (q.customer_phone) conditions.push(eq(workItems.customer_phone, q.customer_phone));

  const items = await db.select()
    .from(workItems)
    .innerJoin(workOrders, eq(workItems.id, workOrders.item_id))
    .where(and(...conditions))
    .orderBy(desc(workItems.created_at))
    .limit(size)
    .offset(offset)
    .all();

  return c.json({
    items: items.map(r => ({ ...r.work_items, ...r.work_orders })),
    total: items.length,
    page,
    size,
  });
});

/** POST / — 创建工单 */
app.post("/", async (c) => {
  const body = await c.req.json<{
    template_id?: string;
    title: string;
    summary?: string;
    description?: string;
    customer_phone?: string;
    customer_name?: string;
    channel?: string;
    source_session_id?: string;
    source_skill_id?: string;
    source_step_id?: string;
    parent_id?: string;
    priority?: string;
    severity?: string;
    queue_code?: string;
    owner_id?: string;
    next_action_at?: string;
    due_at?: string;
    work_type: string;
    execution_mode: string;
    verification_mode?: string;
    required_role?: string;
    location_text?: string;
    created_by?: string;
  }>();

  if (!body.title) return c.json({ error: "title 不能为空" }, 400);
  if (!body.work_type) return c.json({ error: "work_type 不能为空" }, 400);

  // 创建 work_item
  const { id } = await createWorkItem({
    type: 'work_order',
    subtype: body.work_type,
    title: body.title,
    summary: body.summary,
    description: body.description,
    channel: body.channel,
    source_session_id: body.source_session_id,
    source_skill_id: body.source_skill_id,
    source_step_id: body.source_step_id,
    customer_phone: body.customer_phone,
    customer_name: body.customer_name,
    parent_id: body.parent_id,
    priority: body.priority,
    severity: body.severity,
    queue_code: body.queue_code,
    owner_id: body.owner_id,
    next_action_at: body.next_action_at,
    due_at: body.due_at,
    created_by: body.created_by,
  });

  // 插入 work_orders 详情
  await db.insert(workOrders).values({
    item_id: id,
    work_type: body.work_type,
    execution_mode: body.execution_mode ?? 'manual',
    verification_mode: body.verification_mode ?? 'none',
    required_role: body.required_role ?? null,
    location_text: body.location_text ?? null,
  }).run();

  return c.json({ success: true, id }, 201);
});

/** GET /:id — 工单详情 */
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const item = await db.select().from(workItems).where(eq(workItems.id, id)).get();
  if (!item) return c.json({ error: "未找到" }, 404);

  const detail = await db.select().from(workOrders).where(eq(workOrders.item_id, id)).get();
  const availableActions = getAvailableWorkOrderActions(item.status as WorkItemStatus);

  return c.json({ ...item, detail, available_actions: availableActions });
});

/** POST /:id/transition — 状态流转 */
app.post("/:id/transition", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ action: string; note?: string; actor?: string }>();

  if (!body.action) return c.json({ error: "action 不能为空" }, 400);

  const result = await transitionWorkOrder(id, body.action as WorkOrderAction, body.actor, body.note);
  if (!result.success) return c.json({ error: result.error }, 400);

  return c.json(result);
});

/** POST /:id/appointments — 为工单创建预约 */
app.post("/:id/appointments", async (c) => {
  const parentId = c.req.param("id");
  const body = await c.req.json<{
    appointment_type: string;
    scheduled_start_at?: string;
    scheduled_end_at?: string;
    location_text?: string;
    resource_id?: string;
    created_by?: string;
  }>();

  if (!body.appointment_type) return c.json({ error: "appointment_type 不能为空" }, 400);

  const result = await createAppointment(parentId, body);
  if (!result.success) return c.json({ error: result.error }, 400);

  return c.json(result, 201);
});

export default app;
