/**
 * Issue Thread 路由 — 同一事项主线
 */
import { Hono } from "hono";
import { db, issueThreads, workItemIntakes, eq, and, desc } from "../db.js";
import { appendFollowup, reopenThread, mergeMaster } from "../services/followup-orchestrator-service.js";
import type { IssueThreadStatus } from "../types.js";

const router = new Hono();

/** GET / — 列表 */
router.get("/", async (c) => {
  const { customer_phone, status, page, size } = c.req.query();
  const p = page ? Number(page) : 1;
  const s = size ? Number(size) : 20;
  const offset = (p - 1) * s;

  const conditions = [];
  if (customer_phone) conditions.push(eq(issueThreads.customer_phone, customer_phone));
  if (status) conditions.push(eq(issueThreads.status, status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db.select().from(issueThreads)
    .where(where)
    .orderBy(desc(issueThreads.last_seen_at))
    .limit(s)
    .offset(offset)
    .all();

  const countResult = await db.select().from(issueThreads).where(where).all();

  return c.json({ items, total: countResult.length, page: p, size: s });
});

/** GET /:id — 详情（含关联 intakes） */
router.get("/:id", async (c) => {
  const id = c.req.param("id");
  const thread = await db.select().from(issueThreads).where(eq(issueThreads.id, id)).get();
  if (!thread) return c.json({ error: "Thread 不存在" }, 404);

  const intakes = await db.select().from(workItemIntakes)
    .where(eq(workItemIntakes.thread_id, id))
    .orderBy(desc(workItemIntakes.created_at))
    .all();

  return c.json({ ...thread, intakes });
});

/** POST /:id/follow-ups — 追加跟进 */
router.post("/:id/follow-ups", async (c) => {
  const body = await c.req.json();
  if (!body.intake_id) return c.json({ error: "intake_id 不能为空" }, 400);

  const result = await appendFollowup(c.req.param("id"), body.intake_id);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ success: true });
});

/** POST /:id/reopen — 重开 */
router.post("/:id/reopen", async (c) => {
  const body = await c.req.json();
  if (!body.intake_id) return c.json({ error: "intake_id 不能为空" }, 400);

  const result = await reopenThread(c.req.param("id"), body.intake_id);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ success: true });
});

/** POST /:id/merge-master — 合并主单 */
router.post("/:id/merge-master", async (c) => {
  const body = await c.req.json();
  if (!body.source_thread_id) return c.json({ error: "source_thread_id 不能为空" }, 400);

  const result = await mergeMaster(c.req.param("id"), body.source_thread_id, body.merged_by);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ success: true });
});

export default router;
