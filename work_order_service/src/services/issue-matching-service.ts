/**
 * issue-matching-service.ts — 同事项匹配与评分
 *
 * 100 分制评分系统，6 个维度
 */
import { createHash } from "node:crypto";
import { db, workItemIntakes, issueThreads, issueMergeReviews, eq, and, sql } from "../db.js";
import type { ResolutionAction } from "../types.js";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── 评分维度（各为独立纯函数）──────────────────────────────────────────────

interface IntakeData {
  customer_phone?: string | null;
  customer_id?: string | null;
  source_kind?: string | null;
  source_ref?: string | null;
  subject?: string | null;
  signal_json?: string | null;
  normalized_payload_json?: string | null;
}

interface ThreadData {
  customer_phone?: string | null;
  customer_id?: string | null;
  canonical_category_code?: string | null;
  canonical_subject?: string | null;
  last_seen_at: string;
  status: string;
  reopen_until?: string | null;
  metadata_json?: string | null;
}

/** 身份维度：0-30 分 */
export function scoreIdentity(intake: IntakeData, thread: ThreadData): number {
  if (intake.customer_id && thread.customer_id && intake.customer_id === thread.customer_id) return 30;
  if (intake.customer_phone && thread.customer_phone && intake.customer_phone === thread.customer_phone) return 20;
  return 0;
}

/** 业务对象维度：0-25 分 */
export function scoreBusinessObject(intake: IntakeData, thread: ThreadData): number {
  // 从 normalized_payload 提取 category_code
  let intakeCategory: string | undefined;
  if (intake.normalized_payload_json) {
    try {
      const norm = JSON.parse(intake.normalized_payload_json);
      intakeCategory = norm.category_code;
    } catch { /* ignore */ }
  }
  // source_ref 匹配（同一外部引用）
  if (intake.source_ref && thread.metadata_json) {
    try {
      const meta = JSON.parse(thread.metadata_json);
      if (meta.source_ref === intake.source_ref) return 25;
    } catch { /* ignore */ }
  }
  // 同 source_kind
  if (thread.metadata_json) {
    try {
      const meta = JSON.parse(thread.metadata_json);
      if (meta.source_kind === intake.source_kind) return 15;
    } catch { /* ignore */ }
  }
  return 0;
}

/** 分类维度：0-15 分 */
export function scoreCategory(intake: IntakeData, thread: ThreadData): number {
  let intakeCategory: string | undefined;
  if (intake.normalized_payload_json) {
    try {
      const norm = JSON.parse(intake.normalized_payload_json);
      intakeCategory = norm.category_code;
    } catch { /* ignore */ }
  }
  if (!intakeCategory || !thread.canonical_category_code) return 0;

  // 完全匹配叶子分类
  if (intakeCategory === thread.canonical_category_code) return 15;

  // 父分类匹配
  const intakeParts = intakeCategory.split('.');
  const threadParts = thread.canonical_category_code.split('.');
  if (intakeParts.length >= 2 && threadParts.length >= 2 &&
      intakeParts.slice(0, 2).join('.') === threadParts.slice(0, 2).join('.')) return 8;

  // 域匹配
  if (intakeParts[0] === threadParts[0]) return 5;

  return 0;
}

/** 语义维度：0-15 分 */
export function scoreSemantic(intake: IntakeData, thread: ThreadData): number {
  const intakeSubject = (intake.subject ?? '').trim().toLowerCase();
  const threadSubject = (thread.canonical_subject ?? '').trim().toLowerCase();
  if (!intakeSubject || !threadSubject) return 0;

  // 完全匹配
  if (intakeSubject === threadSubject) return 15;

  // 子串重叠
  if (intakeSubject.includes(threadSubject) || threadSubject.includes(intakeSubject)) return 8;

  return 0;
}

/** 时效维度：0-10 分 */
export function scoreRecency(thread: ThreadData): number {
  const lastSeen = new Date(thread.last_seen_at).getTime();
  const now = Date.now();
  const hoursAgo = (now - lastSeen) / (1000 * 60 * 60);

  if (hoursAgo <= 24) return 10;
  if (hoursAgo <= 72) return 6;
  if (hoursAgo <= 168) return 3; // 7 天
  return 0;
}

/** 风险信号维度：0-5 分 */
export function scoreRiskSignal(intake: IntakeData, thread: ThreadData): number {
  if (!intake.signal_json || !thread.metadata_json) return 0;
  try {
    const signals = JSON.parse(intake.signal_json);
    const meta = JSON.parse(thread.metadata_json);
    // 同风险/情绪标签
    if (signals.risk_tags && meta.risk_tags) {
      const intakeTags = new Set(Array.isArray(signals.risk_tags) ? signals.risk_tags : []);
      const threadTags = Array.isArray(meta.risk_tags) ? meta.risk_tags : [];
      for (const tag of threadTags) {
        if (intakeTags.has(tag)) return 5;
      }
    }
    if (signals.emotion_score && meta.emotion_score) return 5;
  } catch { /* ignore */ }
  return 0;
}

/** 综合评分 */
export function scoreCandidate(intake: IntakeData, thread: ThreadData): { total: number; breakdown: Record<string, number> } {
  const identity = scoreIdentity(intake, thread);
  const businessObject = scoreBusinessObject(intake, thread);
  const category = scoreCategory(intake, thread);
  const semantic = scoreSemantic(intake, thread);
  const recency = scoreRecency(thread);
  const riskSignal = scoreRiskSignal(intake, thread);

  return {
    total: identity + businessObject + category + semantic + recency + riskSignal,
    breakdown: { identity, businessObject, category, semantic, recency, riskSignal },
  };
}

// ── 阈值判定 ──────────────────────────────────────────────────────────────

export function applyThresholds(
  score: number,
  threadStatus: string,
  reopenUntil?: string | null,
): ResolutionAction {
  if (score >= 85) {
    if (threadStatus === 'open' || threadStatus === 'resolved') return 'append_followup';
    if (threadStatus === 'closed') {
      if (reopenUntil && new Date(reopenUntil) > new Date()) return 'reopen_master';
    }
    return 'append_followup';
  }
  if (score >= 80 && threadStatus === 'closed') {
    if (reopenUntil && new Date(reopenUntil) > new Date()) return 'reopen_master';
  }
  // 65-84: 需要人工审核（在 matchIntake 中创建 merge_review）
  // < 65: create_new_thread（在 matchIntake 中处理）
  return 'create_new_thread';
}

// ── 主编排 ────────────────────────────────────────────────────────────────

/**
 * 对 intake 执行事项匹配
 */
export async function matchIntake(intakeId: string): Promise<{
  success: boolean;
  error?: string;
  resolution_action?: ResolutionAction;
  thread_id?: string;
  merge_review_id?: string;
}> {
  const intake = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intakeId)).get();
  if (!intake) return { success: false, error: `Intake ${intakeId} 不存在` };

  // 确保已标准化
  if (intake.status === 'new') {
    const { normalizeIntake } = await import('./intake-service.js');
    await normalizeIntake(intakeId);
    // 重新读取
    const refreshed = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intakeId)).get();
    if (refreshed) Object.assign(intake, refreshed);
  }

  // 1. 精确去重（intake 级别：同 source_kind + phone + subject 的重复提交）
  // 仅在去重时间窗内匹配（默认 168 小时 = 7 天），超出窗口的视为合法的再次提交
  // 且仅当对应 thread 仍处于 open 时才去重；若 thread 已 closed/resolved，
  // 则跳过去重，让后面的评分流程走 reopen_master / append_followup
  if (intake.dedupe_key) {
    const DEFAULT_DEDUPE_WINDOW_HOURS = 168;

    // 先找到同 dedupe_key 且已物化的 intake（不带时间窗过滤，因为窗口需要从 thread 动态获取）
    const duplicateIntake = await db.select().from(workItemIntakes)
      .where(and(
        eq(workItemIntakes.dedupe_key, intake.dedupe_key),
        eq(workItemIntakes.status, 'materialized'),
      ))
      .get();

    if (duplicateIntake && duplicateIntake.id !== intakeId) {
      // 从 duplicate 对应的 thread 获取 dedupe_window_hours，回退到默认 168h
      let dedupeWindowHours = DEFAULT_DEDUPE_WINDOW_HOURS;
      let threadStillOpen = true;

      if (duplicateIntake.thread_id) {
        const thread = await db.select().from(issueThreads)
          .where(eq(issueThreads.id, duplicateIntake.thread_id)).get();
        if (thread) {
          dedupeWindowHours = thread.dedupe_window_hours ?? DEFAULT_DEDUPE_WINDOW_HOURS;
          if (thread.status !== 'open') threadStillOpen = false;
        }
      }

      // 检查是否在时间窗内
      const windowStart = new Date(Date.now() - dedupeWindowHours * 60 * 60 * 1000).toISOString();
      const inWindow = duplicateIntake.created_at >= windowStart;

      if (inWindow && threadStillOpen) {
        const now = new Date().toISOString();
        await db.update(workItemIntakes).set({
          resolution_action: 'ignored_duplicate',
          thread_id: duplicateIntake.thread_id,
          status: 'discarded',
          resolution_reason_json: JSON.stringify({ reason: 'exact_dedupe_match', duplicate_of: duplicateIntake.id, window_hours: dedupeWindowHours }),
          updated_at: now,
        }).where(eq(workItemIntakes.id, intakeId)).run();

        return { success: true, resolution_action: 'ignored_duplicate', thread_id: duplicateIntake.thread_id ?? undefined };
      }
      // 超出时间窗或 thread 已 closed/resolved → 跳过去重，继续走后面的评分匹配
    }
  }

  // 1b. thread_key 匹配（同客户 + 同分类 → 跨渠道/措辞归并）
  // 仅当 intake 含有效客户标识且有分类时才走 thread_key 精确匹配，
  // 否则匿名/缺字段的 intake 会被错误归并到同一事项主线
  const hasIdentity = !!(intake.customer_id || intake.customer_phone);
  let intakeCategoryForKey: string | undefined;
  if (intake.normalized_payload_json) {
    try { intakeCategoryForKey = (JSON.parse(intake.normalized_payload_json) as Record<string, unknown>).category_code as string | undefined; } catch { /* ignore */ }
  }
  const hasCategory = !!intakeCategoryForKey;

  if (hasIdentity && hasCategory) {
    const threadKey = computeThreadKey(intake);
    const exactThread = await db.select().from(issueThreads)
      .where(and(
        eq(issueThreads.thread_key, threadKey),
        eq(issueThreads.status, 'open'),
      ))
      .get();

    if (exactThread) {
      const now = new Date().toISOString();
      await db.update(workItemIntakes).set({
        resolution_action: 'append_followup',
        thread_id: exactThread.id,
        resolution_reason_json: JSON.stringify({ reason: 'thread_key_match', thread_key: threadKey }),
        updated_at: now,
      }).where(eq(workItemIntakes.id, intakeId)).run();

      return { success: true, resolution_action: 'append_followup', thread_id: exactThread.id };
    }
  }

  // 2. 候选线程查询（同客户的 open/resolved/recently-closed）
  const candidates = await findCandidateThreads(intake);

  // 3. 评分最佳候选
  let bestScore = 0;
  let bestThread: ThreadData | null = null;
  let bestBreakdown: Record<string, number> = {};

  for (const thread of candidates) {
    const { total, breakdown } = scoreCandidate(intake, thread);
    if (total > bestScore) {
      bestScore = total;
      bestThread = thread;
      bestBreakdown = breakdown;
    }
  }

  const now = new Date().toISOString();

  // 4. 阈值判定
  if (bestThread && bestScore >= 65) {
    if (bestScore >= 85) {
      // 自动追加/合并/重开
      const action = applyThresholds(bestScore, bestThread.status, bestThread.reopen_until);
      await db.update(workItemIntakes).set({
        resolution_action: action,
        thread_id: (bestThread as any).id,
        resolution_reason_json: JSON.stringify({ score: bestScore, breakdown: bestBreakdown }),
        updated_at: now,
      }).where(eq(workItemIntakes.id, intakeId)).run();

      return { success: true, resolution_action: action, thread_id: (bestThread as any).id };
    }

    // 65-84: 创建 merge review
    const reviewId = generateId('mrev');
    const recommendedAction = applyThresholds(bestScore, bestThread.status, bestThread.reopen_until);

    await db.insert(issueMergeReviews).values({
      id: reviewId,
      intake_id: intakeId,
      candidate_thread_id: (bestThread as any).id,
      recommended_action: recommendedAction !== 'create_new_thread' ? recommendedAction : 'append_followup',
      score_total: bestScore,
      score_breakdown_json: JSON.stringify(bestBreakdown),
      match_reason_json: JSON.stringify({ subject: intake.subject, candidate_subject: bestThread.canonical_subject }),
      decision_status: 'pending',
      created_at: now,
    }).run();

    await db.update(workItemIntakes).set({
      resolution_action: 'merge_master', // 暂标为待合并
      thread_id: (bestThread as any).id,
      resolution_reason_json: JSON.stringify({ score: bestScore, breakdown: bestBreakdown, review_id: reviewId }),
      updated_at: now,
    }).where(eq(workItemIntakes.id, intakeId)).run();

    return { success: true, resolution_action: 'merge_master', thread_id: (bestThread as any).id, merge_review_id: reviewId };
  }

  // 5. 低分：创建新 thread
  const threadId = await createThread(intake);

  await db.update(workItemIntakes).set({
    resolution_action: 'create_new_thread',
    thread_id: threadId,
    resolution_reason_json: JSON.stringify({ score: bestScore, reason: 'below_threshold' }),
    updated_at: now,
  }).where(eq(workItemIntakes.id, intakeId)).run();

  return { success: true, resolution_action: 'create_new_thread', thread_id: threadId };
}

/**
 * 查找候选线程（同客户 open/resolved/recently-closed）
 */
async function findCandidateThreads(intake: IntakeData): Promise<Array<ThreadData & { id: string }>> {
  const conditions = [];
  if (intake.customer_phone) {
    conditions.push(eq(issueThreads.customer_phone, intake.customer_phone));
  } else if (intake.customer_id) {
    conditions.push(eq(issueThreads.customer_id, intake.customer_id));
  } else {
    return []; // 无客户标识，无法匹配
  }

  const threads = await db.select().from(issueThreads)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .all();

  // 过滤：open/resolved 保留；closed 只保留 7 天内的
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  return threads.filter(t => {
    if (t.status === 'open' || t.status === 'resolved') return true;
    if (t.status === 'closed') {
      const lastSeen = new Date(t.last_seen_at).getTime();
      return (now - lastSeen) < sevenDaysMs;
    }
    return false;
  });
}

/**
 * 生成稳定的 thread_key：基于客户标识 + 分类（不含渠道和标题措辞）
 * 同一客户同一分类的问题会共享 thread_key，确保跨渠道/措辞归并
 */
function computeThreadKey(intake: IntakeData): string {
  const customerId = intake.customer_id ?? intake.customer_phone ?? '';
  let categoryCode = '';
  if (intake.normalized_payload_json) {
    try {
      const norm = JSON.parse(intake.normalized_payload_json);
      categoryCode = norm.category_code ?? '';
    } catch { /* ignore */ }
  }
  const raw = `thread:${customerId}:${categoryCode}`;
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * 创建新的 issue_thread
 */
export async function createThread(intake: IntakeData & { id?: string }): Promise<string> {
  const id = generateId('thrd');
  const now = new Date().toISOString();

  // thread_key 基于客户标识 + 分类（稳定，不依赖渠道和标题措辞）
  const threadKey = computeThreadKey(intake);

  let categoryCode: string | undefined;
  if (intake.normalized_payload_json) {
    try {
      const norm = JSON.parse(intake.normalized_payload_json);
      categoryCode = norm.category_code;
    } catch { /* ignore */ }
  }

  await db.insert(issueThreads).values({
    id,
    thread_key: threadKey,
    customer_id: intake.customer_id ?? null,
    customer_phone: intake.customer_phone ?? null,
    canonical_category_code: categoryCode ?? null,
    canonical_subject: intake.subject ?? null,
    status: 'open',
    first_seen_at: now,
    last_seen_at: now,
    created_at: now,
    updated_at: now,
    metadata_json: JSON.stringify({
      source_kind: intake.source_kind,
      source_ref: (intake as any).source_ref,
    }),
  }).run();

  return id;
}
