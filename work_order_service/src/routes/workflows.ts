/**
 * workflows.ts — Workflow 路由
 */
import { Hono } from "hono";
import {
  listWorkflowDefinitions,
  getWorkflowDefinition,
  startWorkflowRun,
  getWorkflowRun,
  signalWorkflow,
} from "../services/workflow-service.js";

const app = new Hono();

/** GET /definitions — 列出活跃的 Workflow 定义 */
app.get("/definitions", async (c) => {
  const defs = await listWorkflowDefinitions();
  return c.json({ items: defs });
});

/** GET /definitions/:id — 获取单个 Workflow 定义 */
app.get("/definitions/:id", async (c) => {
  const def = await getWorkflowDefinition(c.req.param("id"));
  if (!def) return c.json({ error: "未找到" }, 404);
  return c.json(def);
});

/** POST /runs — 启动 Workflow Run */
app.post("/runs", async (c) => {
  const body = await c.req.json<{
    definition_key: string;
    item_id: string;
    context?: Record<string, unknown>;
  }>();

  if (!body.definition_key) return c.json({ error: "definition_key 不能为空" }, 400);
  if (!body.item_id) return c.json({ error: "item_id 不能为空" }, 400);

  const result = await startWorkflowRun(body.definition_key, body.item_id, body.context);
  if (!result.success) return c.json({ error: result.error }, 400);

  return c.json(result, 201);
});

/** GET /runs/:id — 获取 Workflow Run 详情 + events */
app.get("/runs/:id", async (c) => {
  const run = await getWorkflowRun(c.req.param("id"));
  if (!run) return c.json({ error: "未找到" }, 404);
  return c.json(run);
});

/** POST /runs/:id/signal — 向等待中的 Workflow 发送信号 */
app.post("/runs/:id/signal", async (c) => {
  const body = await c.req.json<{
    signal: string;
    payload?: Record<string, unknown>;
  }>();

  if (!body.signal) return c.json({ error: "signal 不能为空" }, 400);

  const result = await signalWorkflow(c.req.param("id"), body.signal, body.payload);
  if (!result.success) return c.json({ error: result.error }, 400);

  return c.json(result);
});

export default app;
