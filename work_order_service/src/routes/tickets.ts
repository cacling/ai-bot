/**
 * tickets.ts — Ticket 路由（§7.2）
 */
import { Hono } from "hono";
import { db, workItems, tickets, eq, and, desc } from "../db.js";
import { createTicket, transitionTicket, createChildFromTicket } from "../services/ticket-service.js";
import { createTask } from "../services/task-service.js";
import { getAvailableTicketActions } from "../policies/transition-policy.js";
import type { WorkItemStatus, TicketAction } from "../types.js";

const app = new Hono();

/** GET / — 列出 Ticket */
app.get("/", async (c) => {
  const q = c.req.query();
  const page = q.page ? Number(q.page) : 1;
  const size = q.size ? Number(q.size) : 20;
  const offset = (page - 1) * size;

  const conditions = [eq(workItems.type, 'ticket')];
  if (q.status) conditions.push(eq(workItems.status, q.status));
  if (q.queue_code) conditions.push(eq(workItems.queue_code, q.queue_code));
  if (q.customer_phone) conditions.push(eq(workItems.customer_phone, q.customer_phone));

  const items = await db.select()
    .from(workItems)
    .innerJoin(tickets, eq(workItems.id, tickets.item_id))
    .where(and(...conditions))
    .orderBy(desc(workItems.created_at))
    .limit(size)
    .offset(offset)
    .all();

  return c.json({
    items: items.map(r => ({ ...r.work_items, ...r.tickets })),
    total: items.length,
    page,
    size,
  });
});

/** POST / — 创建 Ticket */
app.post("/", async (c) => {
  const body = await c.req.json<{
    title: string;
    summary?: string;
    description?: string;
    customer_phone?: string;
    customer_name?: string;
    channel?: string;
    source_session_id?: string;
    source_skill_id?: string;
    priority?: string;
    severity?: string;
    queue_code?: string;
    owner_id?: string;
    ticket_category: string;
    issue_type?: string;
    intent_code?: string;
    category_code?: string;
    created_by?: string;
  }>();

  if (!body.title) return c.json({ error: "title 不能为空" }, 400);
  if (!body.ticket_category) return c.json({ error: "ticket_category 不能为空" }, 400);

  const result = await createTicket(body);
  if (!result.success) return c.json({ error: 'failed' }, 400);

  return c.json({ success: true, id: result.id }, 201);
});

/** GET /:id — Ticket 详情 */
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const item = await db.select().from(workItems).where(eq(workItems.id, id)).get();
  if (!item) return c.json({ error: "未找到" }, 404);

  const detail = await db.select().from(tickets).where(eq(tickets.item_id, id)).get();
  const availableActions = getAvailableTicketActions(item.status as WorkItemStatus);

  return c.json({ ...item, detail, available_actions: availableActions });
});

/** POST /:id/transition — 状态流转 */
app.post("/:id/transition", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ action: string; note?: string; actor?: string }>();

  if (!body.action) return c.json({ error: "action 不能为空" }, 400);

  const result = await transitionTicket(id, body.action as TicketAction, body.actor, body.note);
  if (!result.success) return c.json({ error: result.error }, 400);

  return c.json(result);
});

/** POST /:id/children — 从 Ticket 创建子工单 */
app.post("/:id/children", async (c) => {
  const ticketId = c.req.param("id");
  const body = await c.req.json<{
    type: 'work_order';
    subtype?: string;
    category_code?: string;
    title: string;
    queue_code?: string;
    owner_id?: string;
    priority?: string;
    created_by?: string;
  }>();

  if (!body.title) return c.json({ error: "title 不能为空" }, 400);

  const result = await createChildFromTicket(ticketId, {
    type: body.type ?? 'work_order',
    subtype: body.subtype,
    category_code: body.category_code,
    title: body.title,
    queue_code: body.queue_code,
    owner_id: body.owner_id,
    priority: body.priority,
    created_by: body.created_by,
  });
  if (!result.success) return c.json({ error: result.error }, 400);

  return c.json({ success: true, id: result.id }, 201);
});

/** POST /:id/tasks — 从 Ticket 创建子任务 */
app.post("/:id/tasks", async (c) => {
  const ticketId = c.req.param("id");
  const body = await c.req.json<{
    task_type: string;
    title: string;
    category_code?: string;
    owner_id?: string;
    due_at?: string;
    created_by?: string;
  }>();

  if (!body.task_type) return c.json({ error: "task_type 不能为空" }, 400);
  if (!body.title) return c.json({ error: "title 不能为空" }, 400);

  const result = await createTask(ticketId, body);
  if (!result.success) return c.json({ error: result.error }, 400);

  return c.json({ success: true, id: result.id }, 201);
});

export default app;
