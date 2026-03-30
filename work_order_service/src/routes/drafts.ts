/**
 * Draft 路由 — 工单草稿
 */
import { Hono } from "hono";
import { generateDraft, getDraft, editDraft, confirmDraft, discardDraft } from "../services/draft-service.js";

const router = new Hono();

/** POST /generate — 生成草稿 */
router.post("/generate", async (c) => {
  const body = await c.req.json();
  if (!body.intake_id) return c.json({ error: "intake_id 不能为空" }, 400);

  const result = await generateDraft(body.intake_id);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ success: true, id: result.id }, 201);
});

/** GET /:id — 草稿详情 */
router.get("/:id", async (c) => {
  const draft = await getDraft(c.req.param("id"));
  if (!draft) return c.json({ error: "Draft 不存在" }, 404);
  return c.json(draft);
});

/** PATCH /:id — 编辑草稿 */
router.patch("/:id", async (c) => {
  const body = await c.req.json();
  const result = await editDraft(c.req.param("id"), body);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ success: true });
});

/** POST /:id/confirm — 确认发布 */
router.post("/:id/confirm", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await confirmDraft(c.req.param("id"), body.reviewed_by);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ success: true, item_id: result.item_id });
});

/** POST /:id/discard — 丢弃 */
router.post("/:id/discard", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await discardDraft(c.req.param("id"), body.reviewed_by);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ success: true });
});

export default router;
