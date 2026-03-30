/**
 * intake-service.ts — 统一入口线索管理
 */
import { createHash } from "node:crypto";
import { db, workItemIntakes, eq, and, desc } from "../db.js";
import type { SourceKind, IntakeStatus } from "../types.js";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 生成去重键：SHA-256(source_kind + customer_phone + subject_normalized)
 */
function computeDedupeKey(sourceKind: string, customerPhone: string | undefined, subject: string | undefined): string {
  const raw = `${sourceKind}:${(customerPhone ?? '').trim()}:${(subject ?? '').trim().toLowerCase()}`;
  return createHash("sha256").update(raw).digest("hex");
}

export interface CreateIntakeData {
  source_kind: SourceKind;
  source_channel?: string;
  source_ref?: string;
  customer_phone?: string;
  customer_id?: string;
  customer_name?: string;
  subject?: string;
  raw_payload: Record<string, unknown>;
  priority_hint?: string;
  risk_score?: number;
  sentiment_score?: number;
}

/**
 * 创建 Intake
 */
export async function createIntake(data: CreateIntakeData) {
  const id = generateId('intk');
  const now = new Date().toISOString();
  const dedupeKey = computeDedupeKey(data.source_kind, data.customer_phone, data.subject);

  await db.insert(workItemIntakes).values({
    id,
    source_kind: data.source_kind,
    source_channel: data.source_channel ?? null,
    source_ref: data.source_ref ?? null,
    customer_phone: data.customer_phone ?? null,
    customer_id: data.customer_id ?? null,
    customer_name: data.customer_name ?? null,
    subject: data.subject ?? null,
    raw_payload_json: JSON.stringify(data.raw_payload),
    dedupe_key: dedupeKey,
    priority_hint: data.priority_hint ?? null,
    risk_score: data.risk_score ?? null,
    sentiment_score: data.sentiment_score ?? null,
    status: 'new',
    created_at: now,
    updated_at: now,
  }).run();

  return { id, dedupe_key: dedupeKey };
}

// ── 专用 normalizer ────────────────────────────────────────────────────────

interface NormalizeResult {
  normalized: Record<string, unknown>;
  signals: Record<string, unknown>;
  confidence_score: number;  // 0-100，表示结构化提取的完整度/置信度
}

function normalizeDefault(
  raw: Record<string, unknown>,
  intake: { customer_phone?: string | null; customer_name?: string | null; subject?: string | null; source_channel?: string | null; risk_score?: number | null; sentiment_score?: number | null },
): NormalizeResult {
  const normalized: Record<string, unknown> = {
    customer_phone: intake.customer_phone ?? raw.phone ?? raw.customer_phone,
    customer_name: intake.customer_name ?? raw.customer_name ?? raw.name,
    subject: intake.subject ?? raw.subject ?? raw.title,
    summary: raw.summary ?? raw.description,
    category_code: raw.category_code,
    ticket_category: raw.ticket_category,
    work_type: raw.work_type,
    channel: intake.source_channel ?? raw.channel,
  };

  const signals: Record<string, unknown> = {};
  if (raw.emotion_score != null) signals.emotion_score = raw.emotion_score;
  if (raw.risk_tags) signals.risk_tags = raw.risk_tags;
  if (raw.complaint_keywords) signals.complaint_keywords = raw.complaint_keywords;
  if (intake.risk_score != null) signals.risk_score = intake.risk_score;
  if (intake.sentiment_score != null) signals.sentiment_score = intake.sentiment_score;

  // 置信度：按关键字段完整度计算
  let confidence = 0;
  if (normalized.customer_phone) confidence += 25;
  if (normalized.subject) confidence += 25;
  if (normalized.category_code) confidence += 25;
  if (normalized.summary) confidence += 15;
  if (normalized.customer_name) confidence += 10;

  return { normalized, signals, confidence_score: Math.min(confidence, 100) };
}

/**
 * 自助表单 normalizer — 提取表单结构化字段
 */
export function normalizeSelfServiceForm(
  raw: Record<string, unknown>,
  intake: { customer_phone?: string | null; customer_name?: string | null; subject?: string | null; source_channel?: string | null; risk_score?: number | null; sentiment_score?: number | null },
): NormalizeResult {
  const normalized: Record<string, unknown> = {
    customer_phone: intake.customer_phone ?? raw.phone ?? raw.customer_phone ?? raw.contact_phone,
    customer_name: intake.customer_name ?? raw.customer_name ?? raw.name ?? raw.contact_name,
    subject: intake.subject ?? raw.subject ?? raw.title ?? raw.form_title,
    summary: raw.summary ?? raw.description ?? raw.form_description,
    description: raw.description ?? raw.detail ?? raw.form_detail,
    category_code: raw.category_code ?? raw.service_type,
    ticket_category: raw.ticket_category ?? 'request',
    channel: intake.source_channel ?? 'self_service',
    // 表单特有字段
    form_id: raw.form_id,
    form_version: raw.form_version,
    appointment_plan: raw.appointment_plan ?? raw.preferred_time ? {
      appointment_type: (raw.appointment_type as string) ?? 'store_visit',
      preferred_time: raw.preferred_time,
      location: raw.location ?? raw.store_name,
    } : undefined,
  };

  const signals: Record<string, unknown> = {};
  if (intake.risk_score != null) signals.risk_score = intake.risk_score;
  if (intake.sentiment_score != null) signals.sentiment_score = intake.sentiment_score;

  // 自助表单置信度更高（用户主动结构化填写）
  let confidence = 30; // 表单基础分
  if (normalized.customer_phone) confidence += 20;
  if (normalized.subject) confidence += 15;
  if (normalized.category_code) confidence += 20;
  if (normalized.summary || normalized.description) confidence += 10;
  if (raw.form_id) confidence += 5; // 有明确表单来源

  return { normalized, signals, confidence_score: Math.min(confidence, 100) };
}

/**
 * 外部监控 normalizer — 提取告警字段 + 自动设 risk_score
 */
export function normalizeExternalMonitoring(
  raw: Record<string, unknown>,
  intake: { customer_phone?: string | null; customer_name?: string | null; subject?: string | null; source_channel?: string | null; risk_score?: number | null; sentiment_score?: number | null },
): NormalizeResult {
  const severity = (raw.severity as string) ?? (raw.alert_level as string) ?? 'medium';
  const severityToRisk: Record<string, number> = { critical: 95, high: 80, medium: 50, low: 20 };

  const normalized: Record<string, unknown> = {
    customer_phone: intake.customer_phone ?? raw.affected_phone ?? raw.customer_phone,
    customer_name: intake.customer_name ?? raw.customer_name,
    subject: intake.subject ?? raw.alert_title ?? raw.subject ?? `监控告警: ${raw.alert_type ?? 'unknown'}`,
    summary: raw.alert_description ?? raw.summary ?? raw.description,
    description: raw.detail ?? raw.alert_detail,
    category_code: raw.category_code ?? `ticket.incident.${(raw.alert_type as string) ?? 'monitoring'}`,
    ticket_category: 'incident',
    channel: intake.source_channel ?? 'monitoring',
    // 监控特有字段
    alert_id: raw.alert_id,
    alert_type: raw.alert_type,
    alert_severity: severity,
    monitoring_source: raw.source ?? raw.monitoring_system,
    work_type: severity === 'critical' || severity === 'high' ? 'execution' : undefined,
    // 自动预约计划（高严重度）
    appointment_plan: severity === 'critical' ? {
      appointment_type: (raw.appointment_type as string) ?? 'onsite',
      urgency: 'immediate',
    } : undefined,
  };

  const signals: Record<string, unknown> = {
    risk_score: intake.risk_score ?? severityToRisk[severity] ?? 50,
    alert_severity: severity,
  };
  if (raw.risk_tags) signals.risk_tags = raw.risk_tags;

  // 监控告警置信度：系统生成数据，结构化程度高
  let confidence = 50; // 监控系统基础分（机器生成，可信度高）
  if (raw.alert_id) confidence += 15;
  if (raw.alert_type) confidence += 15;
  if (normalized.summary) confidence += 10;
  if (severity === 'critical' || severity === 'high') confidence += 10;

  return { normalized, signals, confidence_score: Math.min(confidence, 100) };
}

/**
 * 根据 source_kind 选择对应的 normalizer
 */
function normalizeBySourceKind(
  sourceKind: SourceKind,
  raw: Record<string, unknown>,
  intake: { customer_phone?: string | null; customer_name?: string | null; subject?: string | null; source_channel?: string | null; risk_score?: number | null; sentiment_score?: number | null },
): NormalizeResult {
  switch (sourceKind) {
    case 'self_service_form':
      return normalizeSelfServiceForm(raw, intake);
    case 'external_monitoring':
      return normalizeExternalMonitoring(raw, intake);
    default:
      return normalizeDefault(raw, intake);
  }
}

/**
 * 标准化 Intake — 从 raw_payload 提取结构化字段
 */
export async function normalizeIntake(intakeId: string) {
  const intake = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intakeId)).get();
  if (!intake) return { success: false, error: `Intake ${intakeId} 不存在` };
  if (intake.status !== 'new') return { success: false, error: `Intake 状态为 ${intake.status}，无法标准化` };

  const raw = JSON.parse(intake.raw_payload_json) as Record<string, unknown>;

  // 根据 source_kind 选择专用 normalizer
  const { normalized, signals, confidence_score } = normalizeBySourceKind(intake.source_kind as SourceKind, raw, intake);

  const now = new Date().toISOString();

  // 回填后的 subject 和 customer_phone
  const resolvedSubject = intake.subject ?? (normalized.subject as string) ?? null;
  const resolvedPhone = intake.customer_phone ?? (normalized.customer_phone as string) ?? null;

  // 用 normalize 后的真实字段重算 dedupe_key，避免空 subject 导致误判重复
  const updatedDedupeKey = computeDedupeKey(
    intake.source_kind as string,
    resolvedPhone ?? undefined,
    resolvedSubject ?? undefined,
  );

  await db.update(workItemIntakes).set({
    normalized_payload_json: JSON.stringify(normalized),
    signal_json: Object.keys(signals).length > 0 ? JSON.stringify(signals) : null,
    // 回填 customer 字段（如果原始未填但 raw_payload 中有）
    customer_phone: resolvedPhone,
    customer_name: intake.customer_name ?? (normalized.customer_name as string) ?? null,
    subject: resolvedSubject,
    // 回填 risk_score（external_monitoring 自动计算）
    risk_score: intake.risk_score ?? (signals.risk_score as number | undefined) ?? null,
    // 回填 confidence_score（normalizer 自动计算）
    confidence_score: confidence_score,
    // 重算 dedupe_key（用 normalize 后的 subject）
    dedupe_key: updatedDedupeKey,
    status: 'analyzed',
    updated_at: now,
  }).where(eq(workItemIntakes.id, intakeId)).run();

  return { success: true };
}

/**
 * 获取单个 Intake
 */
export async function getIntake(id: string) {
  return db.select().from(workItemIntakes).where(eq(workItemIntakes.id, id)).get();
}

/**
 * 列表查询
 */
export async function listIntakes(filters: {
  status?: IntakeStatus;
  source_kind?: SourceKind;
  customer_phone?: string;
  page?: number;
  size?: number;
}) {
  const page = filters.page ?? 1;
  const size = filters.size ?? 20;
  const offset = (page - 1) * size;

  const conditions = [];
  if (filters.status) conditions.push(eq(workItemIntakes.status, filters.status));
  if (filters.source_kind) conditions.push(eq(workItemIntakes.source_kind, filters.source_kind));
  if (filters.customer_phone) conditions.push(eq(workItemIntakes.customer_phone, filters.customer_phone));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db.select().from(workItemIntakes)
    .where(where)
    .orderBy(desc(workItemIntakes.created_at))
    .limit(size)
    .offset(offset)
    .all();

  const countResult = await db.select().from(workItemIntakes).where(where).all();

  return { items, total: countResult.length, page, size };
}

/**
 * 更新 Intake 状态
 */
/**
 * 全自动处理流水线：normalize → match → policy → materialize/orchestrate
 * 用于 auto_create 模式（handoff_overflow、emotion_escalation 等）
 */
export async function processIntakeAuto(intakeId: string): Promise<{
  success: boolean;
  item_id?: string;
  decision_mode?: string;
  resolution_action?: string;
  error?: string;
}> {
  const intake = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intakeId)).get();
  if (!intake) return { success: false, error: `Intake ${intakeId} 不存在` };

  // Step 1: Normalize
  if (intake.status === 'new') {
    const normResult = await normalizeIntake(intakeId);
    if (!normResult.success) return { success: false, error: normResult.error };
  }

  // Step 2: Match
  const { matchIntake } = await import('./issue-matching-service.js');
  const matchResult = await matchIntake(intakeId);
  if (!matchResult.success) return { success: false, error: matchResult.error };

  // Step 3: Policy
  const { resolveDecisionMode, shouldAutoCreate } = await import('./policy-engine-service.js');
  const refreshedIntake = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intakeId)).get();
  if (!refreshedIntake) return { success: false, error: 'Intake 不存在' };

  const decisionMode = resolveDecisionMode({
    source_kind: refreshedIntake.source_kind as SourceKind,
    risk_score: refreshedIntake.risk_score,
    sentiment_score: refreshedIntake.sentiment_score,
    confidence_score: refreshedIntake.confidence_score,
  });

  await updateIntakeStatus(intakeId, refreshedIntake.status as IntakeStatus, { decision_mode: decisionMode });

  // Step 4: 根据 resolution_action 和 decision_mode 执行
  const resAction = matchResult.resolution_action;

  // append_followup / reopen_master — matchIntake 只写了标记，这里实际执行
  if (resAction === 'append_followup' && matchResult.thread_id) {
    const { appendFollowup } = await import('./followup-orchestrator-service.js');
    await appendFollowup(matchResult.thread_id, intakeId);
    return {
      success: true,
      resolution_action: resAction,
      decision_mode: decisionMode,
    };
  }
  if (resAction === 'reopen_master' && matchResult.thread_id) {
    const { reopenThread } = await import('./followup-orchestrator-service.js');
    await reopenThread(matchResult.thread_id, intakeId);
    return {
      success: true,
      resolution_action: resAction,
      decision_mode: decisionMode,
    };
  }

  // create_new_thread → 如果是 auto_create，直接 materialize
  if (resAction === 'create_new_thread' && shouldAutoCreate(decisionMode, refreshedIntake.confidence_score)) {
    const { materializeIntakeDirectly } = await import('./materializer-service.js');
    const matResult = await materializeIntakeDirectly(intakeId);
    if (!matResult.success) return { success: false, error: matResult.error };
    return {
      success: true,
      item_id: matResult.item_id,
      resolution_action: resAction,
      decision_mode: decisionMode,
    };
  }

  // 其他情况（pending_review、manual_confirm）→ 返回让上层决定
  return {
    success: true,
    resolution_action: resAction,
    decision_mode: decisionMode,
  };
}

export async function updateIntakeStatus(
  id: string,
  status: IntakeStatus,
  extras?: Partial<{
    thread_id: string;
    materialized_item_id: string;
    resolution_action: string;
    resolution_reason_json: string;
    decision_mode: string;
  }>,
) {
  const now = new Date().toISOString();
  await db.update(workItemIntakes).set({
    status,
    ...extras,
    updated_at: now,
  }).where(eq(workItemIntakes.id, id)).run();
}
