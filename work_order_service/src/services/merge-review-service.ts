/**
 * merge-review-service.ts — 合并审核管理
 *
 * 创建、批准、驳回合并审核记录
 */
import { db, issueMergeReviews, eq } from "../db.js";
import type { ResolutionAction } from "../types.js";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 创建合并审核
 */
export async function createMergeReview(data: {
  intake_id: string;
  candidate_thread_id: string;
  recommended_action: ResolutionAction;
  score_total: number;
  score_breakdown_json: string;
  match_reason_json?: string;
}): Promise<{ id: string }> {
  const id = generateId('mrev');
  const now = new Date().toISOString();

  await db.insert(issueMergeReviews).values({
    id,
    intake_id: data.intake_id,
    candidate_thread_id: data.candidate_thread_id,
    recommended_action: data.recommended_action,
    score_total: data.score_total,
    score_breakdown_json: data.score_breakdown_json,
    match_reason_json: data.match_reason_json ?? null,
    decision_status: 'pending',
    created_at: now,
  }).run();

  return { id };
}

/**
 * 批准合并审核 — 执行推荐动作
 */
export async function approveMergeReview(
  reviewId: string,
  decidedBy?: string,
): Promise<{ success: boolean; error?: string }> {
  const review = await db.select().from(issueMergeReviews).where(eq(issueMergeReviews.id, reviewId)).get();
  if (!review) return { success: false, error: `MergeReview ${reviewId} 不存在` };
  if (review.decision_status !== 'pending') return { success: false, error: `状态为 ${review.decision_status}，无法批准` };

  const now = new Date().toISOString();

  // 标记为 approved
  await db.update(issueMergeReviews).set({
    decision_status: 'approved',
    decided_by: decidedBy ?? null,
    decided_at: now,
  }).where(eq(issueMergeReviews.id, reviewId)).run();

  // 执行推荐动作
  const action = review.recommended_action as ResolutionAction;
  const { appendFollowup, reopenThread } = await import('./followup-orchestrator-service.js');

  let execResult: { success: boolean; error?: string } = { success: true };

  if (action === 'append_followup') {
    execResult = await appendFollowup(review.candidate_thread_id!, review.intake_id);
  } else if (action === 'reopen_master') {
    execResult = await reopenThread(review.candidate_thread_id!, review.intake_id);
  }
  // merge_into_master 等高级操作 Phase 3 扩展

  if (execResult.success) {
    await db.update(issueMergeReviews).set({
      decision_status: 'executed',
      executed_at: new Date().toISOString(),
    }).where(eq(issueMergeReviews.id, reviewId)).run();
  }

  return execResult;
}

/**
 * 驳回合并审核 — 创建新 thread
 */
export async function rejectMergeReview(
  reviewId: string,
  decidedBy?: string,
): Promise<{ success: boolean; thread_id?: string; error?: string }> {
  const review = await db.select().from(issueMergeReviews).where(eq(issueMergeReviews.id, reviewId)).get();
  if (!review) return { success: false, error: `MergeReview ${reviewId} 不存在` };
  if (review.decision_status !== 'pending') return { success: false, error: `状态为 ${review.decision_status}，无法驳回` };

  const now = new Date().toISOString();

  await db.update(issueMergeReviews).set({
    decision_status: 'rejected',
    decided_by: decidedBy ?? null,
    decided_at: now,
  }).where(eq(issueMergeReviews.id, reviewId)).run();

  // 创建新 thread
  const { createThread } = await import('./issue-matching-service.js');
  const { getIntake, updateIntakeStatus } = await import('./intake-service.js');
  const intake = await getIntake(review.intake_id);
  if (intake) {
    const threadId = await createThread(intake);
    await updateIntakeStatus(review.intake_id, 'analyzed', {
      thread_id: threadId,
      resolution_action: 'create_new_thread',
    });
    return { success: true, thread_id: threadId };
  }

  return { success: true };
}
