/**
 * Merge Review 路由 — 合并审核
 */
import { Hono } from "hono";
import { db, issueMergeReviews, eq, and, desc } from "../db.js";
import { approveMergeReview, rejectMergeReview } from "../services/merge-review-service.js";
import type { MergeReviewStatus } from "../types.js";

const router = new Hono();

/** GET / — 列表 */
router.get("/", async (c) => {
  const { decision_status, page, size } = c.req.query();
  const p = page ? Number(page) : 1;
  const s = size ? Number(size) : 20;
  const offset = (p - 1) * s;

  const conditions = [];
  if (decision_status) conditions.push(eq(issueMergeReviews.decision_status, decision_status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db.select().from(issueMergeReviews)
    .where(where)
    .orderBy(desc(issueMergeReviews.created_at))
    .limit(s)
    .offset(offset)
    .all();

  const countResult = await db.select().from(issueMergeReviews).where(where).all();

  return c.json({ items, total: countResult.length, page: p, size: s });
});

/** GET /:id — 详情 */
router.get("/:id", async (c) => {
  const review = await db.select().from(issueMergeReviews).where(eq(issueMergeReviews.id, c.req.param("id"))).get();
  if (!review) return c.json({ error: "MergeReview 不存在" }, 404);
  return c.json(review);
});

/** POST /:id/approve — 批准并执行推荐动作 */
router.post("/:id/approve", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const review = await db.select().from(issueMergeReviews).where(eq(issueMergeReviews.id, id)).get();
  if (!review) return c.json({ error: "MergeReview 不存在" }, 404);

  const result = await approveMergeReview(id, body.decided_by);
  if (!result.success) return c.json({ error: result.error }, 400);

  return c.json({ success: true });
});

/** POST /:id/reject — 驳回并创建新 thread */
router.post("/:id/reject", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const review = await db.select().from(issueMergeReviews).where(eq(issueMergeReviews.id, id)).get();
  if (!review) return c.json({ error: "MergeReview 不存在" }, 404);

  const result = await rejectMergeReview(id, body.decided_by);
  if (!result.success) return c.json({ error: result.error }, 400);

  return c.json({ success: true, thread_id: result.thread_id });
});

export default router;
