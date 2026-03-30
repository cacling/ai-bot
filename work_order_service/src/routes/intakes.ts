/**
 * Intake 路由 — 统一入口线索
 */
import { Hono } from "hono";
import { createIntake, getIntake, listIntakes, normalizeIntake, processIntakeAuto } from "../services/intake-service.js";
import { matchIntake } from "../services/issue-matching-service.js";
import { resolveDecisionMode } from "../services/policy-engine-service.js";
import type { SourceKind, IntakeStatus } from "../types.js";

const router = new Hono();

/** POST / — 创建 intake */
router.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.source_kind) return c.json({ error: "source_kind 不能为空" }, 400);
  if (!body.raw_payload) return c.json({ error: "raw_payload 不能为空" }, 400);

  const result = await createIntake({
    source_kind: body.source_kind as SourceKind,
    source_channel: body.source_channel,
    source_ref: body.source_ref,
    customer_phone: body.customer_phone,
    customer_id: body.customer_id,
    customer_name: body.customer_name,
    subject: body.subject,
    raw_payload: body.raw_payload,
    priority_hint: body.priority_hint,
    risk_score: body.risk_score,
    sentiment_score: body.sentiment_score,
  });

  return c.json({ success: true, ...result }, 201);
});

/** GET / — 列表 */
router.get("/", async (c) => {
  const { status, source_kind, customer_phone, page, size } = c.req.query();
  const result = await listIntakes({
    status: status as IntakeStatus | undefined,
    source_kind: source_kind as SourceKind | undefined,
    customer_phone,
    page: page ? Number(page) : undefined,
    size: size ? Number(size) : undefined,
  });
  return c.json(result);
});

/** GET /:id — 详情 */
router.get("/:id", async (c) => {
  const intake = await getIntake(c.req.param("id"));
  if (!intake) return c.json({ error: "Intake 不存在" }, 404);
  return c.json(intake);
});

/** POST /:id/match — 触发事项匹配 */
router.post("/:id/match", async (c) => {
  const id = c.req.param("id");
  const intake = await getIntake(id);
  if (!intake) return c.json({ error: "Intake 不存在" }, 404);

  // 先标准化
  if (intake.status === "new") {
    const normResult = await normalizeIntake(id);
    if (!normResult.success) return c.json({ error: normResult.error }, 400);
  }

  // 匹配
  const matchResult = await matchIntake(id);
  if (!matchResult.success) return c.json({ error: matchResult.error }, 400);

  // 推断决策模式 — 使用 normalize 后的快照（risk_score 等可能在 normalize 时回填）
  const refreshedIntake = await getIntake(id);
  const decisionMode = resolveDecisionMode({
    source_kind: (refreshedIntake ?? intake).source_kind as SourceKind,
    risk_score: (refreshedIntake ?? intake).risk_score,
    sentiment_score: (refreshedIntake ?? intake).sentiment_score,
    confidence_score: (refreshedIntake ?? intake).confidence_score,
  });

  return c.json({
    success: true,
    resolution_action: matchResult.resolution_action,
    thread_id: matchResult.thread_id,
    merge_review_id: matchResult.merge_review_id,
    decision_mode: decisionMode,
  });
});

/** POST /:id/process — 全自动处理（auto_create 模式） */
router.post("/:id/process", async (c) => {
  const id = c.req.param("id");
  const intake = await getIntake(id);
  if (!intake) return c.json({ error: "Intake 不存在" }, 404);

  const result = await processIntakeAuto(id);
  if (!result.success) return c.json({ error: result.error }, 400);

  return c.json(result);
});

/** POST /webhook — 接收外部监控事件（fire-and-forget） */
router.post("/webhook", async (c) => {
  const body = await c.req.json();

  // 最低要求：有 raw_payload
  if (!body.raw_payload && !body.alert_title) {
    return c.json({ error: "raw_payload 或 alert_title 不能为空" }, 400);
  }

  // 构建 intake 数据
  const sourceKind = (body.source_kind ?? 'external_monitoring') as SourceKind;
  const rawPayload = body.raw_payload ?? body;

  const result = await createIntake({
    source_kind: sourceKind,
    source_channel: body.source_channel ?? 'webhook',
    source_ref: body.alert_id ?? body.source_ref,
    customer_phone: body.customer_phone ?? body.affected_phone,
    subject: body.alert_title ?? body.subject,
    raw_payload: rawPayload,
    risk_score: body.risk_score,
  });

  // 202 Accepted — fire-and-forget 异步处理
  processIntakeAuto(result.id).catch(() => { /* ignore */ });

  return c.json({ accepted: true, intake_id: result.id }, 202);
});

export default router;
