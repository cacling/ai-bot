/**
 * templates.ts — 模板路由
 */
import { Hono } from "hono";
import { listTemplates, getTemplate, createFromTemplate } from "../services/template-service.js";
import { listQueues } from "../services/queue-service.js";

const app = new Hono();

/** GET / — 列出模板 */
app.get("/", async (c) => {
  const templates = await listTemplates();
  return c.json({ items: templates });
});

/** GET /queues — 列出队列 */
app.get("/queues", async (c) => {
  const queues = await listQueues();
  return c.json({ items: queues });
});

/** GET /:id — 模板详情 */
app.get("/:id", async (c) => {
  const tpl = await getTemplate(c.req.param("id"));
  if (!tpl) return c.json({ error: "未找到" }, 404);
  return c.json(tpl);
});

/** POST /:id/instantiate — 从模板创建工单 */
app.post("/:id/instantiate", async (c) => {
  const templateId = c.req.param("id");
  const body = await c.req.json<{
    title?: string;
    summary?: string;
    customer_phone?: string;
    customer_name?: string;
    owner_id?: string;
    queue_code?: string;
    priority?: string;
    parent_id?: string;
    source_session_id?: string;
    source_skill_id?: string;
    source_step_id?: string;
    created_by?: string;
  }>();

  const result = await createFromTemplate(templateId, body);
  if (!result.success) return c.json({ error: result.error }, 400);

  return c.json(result, 201);
});

export default app;
