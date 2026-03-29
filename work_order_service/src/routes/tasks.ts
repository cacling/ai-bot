/**
 * tasks.ts — Task 路由（§7.5）
 */
import { Hono } from "hono";
import { db, workItems, tasks, eq, and, desc } from "../db.js";
import {
  createTask,
  startTask,
  completeTask,
  blockTask,
  unblockTask,
  cancelTask,
} from "../services/task-service.js";
import { getAvailableTaskActions } from "../policies/transition-policy.js";
import type { WorkItemStatus } from "../types.js";

const app = new Hono();

/** POST / — 创建 Task */
app.post("/", async (c) => {
  const body = await c.req.json<{
    parent_id: string;
    task_type: string;
    title: string;
    category_code?: string;
    owner_id?: string;
    due_at?: string;
    checklist_json?: string;
    depends_on_item_id?: string;
    auto_complete_on_event?: string;
    created_by?: string;
  }>();

  if (!body.parent_id) return c.json({ error: "parent_id 不能为空" }, 400);
  if (!body.task_type) return c.json({ error: "task_type 不能为空" }, 400);
  if (!body.title) return c.json({ error: "title 不能为空" }, 400);

  const result = await createTask(body.parent_id, body);
  if (!result.success) return c.json({ error: result.error }, 400);

  return c.json({ success: true, id: result.id }, 201);
});

/** GET /:id — Task 详情 */
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const item = await db.select().from(workItems).where(eq(workItems.id, id)).get();
  if (!item) return c.json({ error: "未找到" }, 404);

  const detail = await db.select().from(tasks).where(eq(tasks.item_id, id)).get();
  const availableActions = getAvailableTaskActions(item.status as WorkItemStatus);

  return c.json({ ...item, detail, available_actions: availableActions });
});

/** POST /:id/start */
app.post("/:id/start", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ actor?: string }>().catch(() => ({}));
  const result = await startTask(id, body.actor);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

/** POST /:id/complete */
app.post("/:id/complete", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ actor?: string }>().catch(() => ({}));
  const result = await completeTask(id, body.actor);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

/** POST /:id/block */
app.post("/:id/block", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ reason?: string; actor?: string }>().catch(() => ({}));
  const result = await blockTask(id, body.reason, body.actor);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

/** POST /:id/unblock */
app.post("/:id/unblock", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ actor?: string }>().catch(() => ({}));
  const result = await unblockTask(id, body.actor);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

/** POST /:id/cancel */
app.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ actor?: string }>().catch(() => ({}));
  const result = await cancelTask(id, body.actor);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

export default app;
