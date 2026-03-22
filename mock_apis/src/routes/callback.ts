/**
 * POST /api/callback/create — 创建回访任务
 *
 * 模拟工单系统：插入回访记录，返回任务 ID。
 */
import { Hono } from "hono";
import { db, callbackTasks } from "../db.js";

const app = new Hono();

app.post("/create", async (c) => {
  const body = await c.req.json<{
    original_task_id?: string;
    callback_phone?: string;
    preferred_time?: string;
    customer_name?: string;
    product_name?: string;
  }>();

  if (!body.original_task_id || !body.callback_phone || !body.preferred_time) {
    return c.json({ success: false, message: "original_task_id、callback_phone、preferred_time 不能为空" }, 400);
  }

  const taskId = `CB-${Date.now().toString(36)}`;
  await db.insert(callbackTasks).values({
    task_id: taskId,
    original_task_id: body.original_task_id,
    customer_name: body.customer_name ?? "",
    callback_phone: body.callback_phone,
    preferred_time: body.preferred_time,
    product_name: body.product_name ?? "",
    created_at: new Date().toISOString(),
    status: "pending",
  }).run();

  return c.json({
    success: true,
    callback_task_id: taskId,
    message: `回访任务已创建，将于 ${body.preferred_time} 回访 ${body.callback_phone}`,
  });
});

export default app;
