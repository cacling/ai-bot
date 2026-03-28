/**
 * work-items.ts — 通用 work_item 路由（§7.1 + §7.6）
 */
import { Hono } from "hono";
import { listWorkItems, getWorkItemDetail, addEvent } from "../services/item-service.js";
import type { WorkItemType, WorkItemStatus } from "../types.js";

const app = new Hono();

/** GET / — 列表查询 */
app.get("/", async (c) => {
  const q = c.req.query();
  const result = await listWorkItems({
    type: q.type as WorkItemType | undefined,
    status: q.status as WorkItemStatus | undefined,
    queue_code: q.queue_code,
    owner_id: q.owner_id,
    customer_phone: q.customer_phone,
    root_id: q.root_id,
    parent_id: q.parent_id,
    source_session_id: q.source_session_id,
    page: q.page ? Number(q.page) : undefined,
    size: q.size ? Number(q.size) : undefined,
  });
  return c.json(result);
});

/** GET /:id — 聚合详情 */
app.get("/:id", async (c) => {
  const detail = await getWorkItemDetail(c.req.param("id"));
  if (!detail) return c.json({ error: "未找到" }, 404);
  return c.json(detail);
});

/** POST /:id/events — 添加事件/备注 */
app.post("/:id/events", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    event_type: string;
    visibility?: string;
    note?: string;
    payload?: Record<string, unknown>;
    actor_type?: string;
    actor_id?: string;
  }>();

  if (!body.event_type) {
    return c.json({ error: "event_type 不能为空" }, 400);
  }

  await addEvent({
    item_id: id,
    event_type: body.event_type,
    actor_type: body.actor_type,
    actor_id: body.actor_id,
    visibility: body.visibility,
    note: body.note,
    payload: body.payload,
  });

  return c.json({ ok: true });
});

export default app;
