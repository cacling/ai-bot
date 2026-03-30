/**
 * API tests for: Merge review approve/reject flows (Iteration 2)
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { createApp } from '../../src/server';
import { db, issueMergeReviews, issueThreads, workItemIntakes, eq } from '../../src/db';
import { createMergeReview } from '../../src/services/merge-review-service';

const app = createApp();

async function get(path: string) {
  const res = await app.request(path);
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('Merge review service', () => {
  test('createMergeReview creates a pending review', async () => {
    const { id } = await createMergeReview({
      intake_id: 'intk-demo-001',
      candidate_thread_id: 'thrd-demo-001',
      recommended_action: 'append_followup',
      score_total: 78,
      score_breakdown_json: JSON.stringify({ identity: 20, category: 15, semantic: 15, recency: 10, business: 15, risk: 3 }),
    });
    expect(id).toBeDefined();

    const review = await db.select().from(issueMergeReviews).where(eq(issueMergeReviews.id, id)).get();
    expect(review).toBeDefined();
    expect(review!.decision_status).toBe('pending');
    expect(review!.score_total).toBe(78);

    // cleanup
    await db.delete(issueMergeReviews).where(eq(issueMergeReviews.id, id)).run();
  });
});

describe('POST /api/merge-reviews/:id/approve', () => {
  test('approve executes recommended action (append_followup)', async () => {
    // Create a test intake that can be appended
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      customer_phone: '13800000001',
      subject: '合并审核测试 - 追加跟进',
      raw_payload: { summary: '测试合并追加' },
    });
    const intakeId = intakeData.id as string;

    // Create merge review
    const { id: reviewId } = await createMergeReview({
      intake_id: intakeId,
      candidate_thread_id: 'thrd-demo-001',
      recommended_action: 'append_followup',
      score_total: 78,
      score_breakdown_json: JSON.stringify({ identity: 20, category: 15, semantic: 15, recency: 10, business: 15, risk: 3 }),
    });

    // Approve
    const { status, data } = await post(`/api/merge-reviews/${reviewId}/approve`, {
      decided_by: 'agent_test',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);

    // Verify review is executed
    const review = await db.select().from(issueMergeReviews).where(eq(issueMergeReviews.id, reviewId)).get();
    expect(review!.decision_status).toBe('executed');
    expect(review!.decided_by).toBe('agent_test');
    expect(review!.executed_at).toBeDefined();

    // Verify intake was updated
    const intake = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intakeId)).get();
    expect(intake!.thread_id).toBe('thrd-demo-001');
  });

  test('approve returns 400 for non-pending review', async () => {
    const { id: reviewId } = await createMergeReview({
      intake_id: 'intk-demo-001',
      candidate_thread_id: 'thrd-demo-001',
      recommended_action: 'append_followup',
      score_total: 78,
      score_breakdown_json: '{}',
    });
    // Approve first time
    await post(`/api/merge-reviews/${reviewId}/approve`, {});
    // Try again
    const { status } = await post(`/api/merge-reviews/${reviewId}/approve`, {});
    expect(status).toBe(400);
  });
});

describe('POST /api/merge-reviews/:id/reject', () => {
  test('reject creates new thread', async () => {
    // Create a test intake
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      customer_phone: '13800500001',
      subject: '合并审核测试 - 驳回',
      raw_payload: { summary: '测试驳回建新线' },
    });
    const intakeId = intakeData.id as string;

    // Normalize it first (needed for createThread)
    await post(`/api/intakes/${intakeId}/match`, {});

    // Create merge review
    const { id: reviewId } = await createMergeReview({
      intake_id: intakeId,
      candidate_thread_id: 'thrd-demo-001',
      recommended_action: 'append_followup',
      score_total: 72,
      score_breakdown_json: '{}',
    });

    // Reject
    const { status, data } = await post(`/api/merge-reviews/${reviewId}/reject`, {
      decided_by: 'agent_test',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.thread_id).toBeDefined();

    // Verify review is rejected
    const review = await db.select().from(issueMergeReviews).where(eq(issueMergeReviews.id, reviewId)).get();
    expect(review!.decision_status).toBe('rejected');
  });
});

describe('Issue thread merge-master', () => {
  test('POST /:id/merge-master merges source into target', async () => {
    // Create two threads via intakes
    const { data: intake1 } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      customer_phone: '13800600001',
      subject: '合并测试 - 目标',
      raw_payload: { summary: '目标线' },
    });
    await post(`/api/intakes/${intake1.id}/match`, {});
    const { data: match1 } = await post(`/api/intakes/${intake1.id}/match`, {});

    const { data: intake2 } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      customer_phone: '13800600001',
      subject: '合并测试 - 来源（不同问题）',
      raw_payload: { summary: '来源线' },
    });
    await post(`/api/intakes/${intake2.id}/match`, {});

    // Get threads
    const intakeDetail1 = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intake1.id as string)).get();
    const intakeDetail2 = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intake2.id as string)).get();

    if (intakeDetail1?.thread_id && intakeDetail2?.thread_id && intakeDetail1.thread_id !== intakeDetail2.thread_id) {
      const { status, data } = await post(`/api/issue-threads/${intakeDetail1.thread_id}/merge-master`, {
        source_thread_id: intakeDetail2.thread_id,
      });
      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Verify source thread is closed
      const sourceThread = await db.select().from(issueThreads).where(eq(issueThreads.id, intakeDetail2.thread_id)).get();
      expect(sourceThread!.status).toBe('closed');
    }
  });

  test('returns 400 without source_thread_id', async () => {
    const { status } = await post('/api/issue-threads/thrd-demo-001/merge-master', {});
    expect(status).toBe(400);
  });
});
