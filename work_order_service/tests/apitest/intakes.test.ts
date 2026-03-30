/**
 * API tests for: Intake pipeline (intake → match → draft → confirm → formal work item)
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { createApp } from '../../src/server';
import { db, workItemIntakes, workItemDrafts, issueThreads, issueMergeReviews, eq } from '../../src/db';

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

async function patch(path: string, body: Record<string, unknown>) {
  const res = await app.request(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

// Clean up test data before each run
beforeAll(async () => {
  // Only clean test-specific data (prefixed with intk_test / drft_test / thrd_test)
  const intakes = await db.select().from(workItemIntakes).all();
  for (const intk of intakes) {
    if (intk.id.startsWith('intk_')) {
      await db.delete(workItemIntakes).where(eq(workItemIntakes.id, intk.id)).run();
    }
  }
  const drafts = await db.select().from(workItemDrafts).all();
  for (const d of drafts) {
    if (d.id.startsWith('drft_')) {
      await db.delete(workItemDrafts).where(eq(workItemDrafts.id, d.id)).run();
    }
  }
  const threads = await db.select().from(issueThreads).all();
  for (const t of threads) {
    if (t.id.startsWith('thrd_')) {
      await db.delete(issueThreads).where(eq(issueThreads.id, t.id)).run();
    }
  }
  const reviews = await db.select().from(issueMergeReviews).all();
  for (const r of reviews) {
    if (r.id.startsWith('mrev_')) {
      await db.delete(issueMergeReviews).where(eq(issueMergeReviews.id, r.id)).run();
    }
  }
});

describe('POST /api/intakes', () => {
  test('creates intake with required fields', async () => {
    const { status, data } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      source_channel: 'online',
      source_ref: 'sess_test_001',
      customer_phone: '13800100001',
      subject: '测试工单入口',
      raw_payload: { session_id: 'sess_test_001', summary: '测试摘要' },
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    expect(data.dedupe_key).toBeDefined();
  });

  test('returns 400 when source_kind is missing', async () => {
    const { status } = await post('/api/intakes', {
      raw_payload: { test: true },
    });
    expect(status).toBe(400);
  });

  test('returns 400 when raw_payload is missing', async () => {
    const { status } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
    });
    expect(status).toBe(400);
  });
});

describe('GET /api/intakes', () => {
  test('lists intakes', async () => {
    const { status, data } = await get('/api/intakes');
    expect(status).toBe(200);
    expect(data.items).toBeDefined();
    expect((data.items as any[]).length).toBeGreaterThanOrEqual(1);
  });

  test('filters by source_kind', async () => {
    const { data } = await get('/api/intakes?source_kind=agent_after_service');
    const items = data.items as any[];
    for (const item of items) {
      expect(item.source_kind).toBe('agent_after_service');
    }
  });
});

describe('GET /api/intakes/:id', () => {
  test('returns intake by id', async () => {
    // 使用 seed 数据
    const { status, data } = await get('/api/intakes/intk-demo-001');
    expect(status).toBe(200);
    expect(data.source_kind).toBe('agent_after_service');
  });

  test('returns 404 for unknown id', async () => {
    const { status } = await get('/api/intakes/nonexistent');
    expect(status).toBe(404);
  });
});

describe('POST /api/intakes/:id/match', () => {
  test('matches intake and creates new thread for new customer', async () => {
    // 创建一个新客户的 intake
    const { data: createData } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      customer_phone: '13899999999',
      subject: '全新问题',
      raw_payload: { summary: '全新客户全新问题' },
    });
    const intakeId = createData.id as string;

    const { status, data } = await post(`/api/intakes/${intakeId}/match`, {});
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.resolution_action).toBe('create_new_thread');
    expect(data.thread_id).toBeDefined();
    expect(data.decision_mode).toBe('manual_confirm');
  });

  test('returns 404 for unknown intake', async () => {
    const { status } = await post('/api/intakes/nonexistent/match', {});
    expect(status).toBe(404);
  });
});

describe('End-to-end: intake → match → draft → confirm → formal work item', () => {
  test('Scenario 1: agent_after_service full flow', async () => {
    // Step 1: Create intake
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      source_channel: 'online',
      customer_phone: '13800200001',
      customer_name: '测试用户',
      subject: 'App 登录异常 - 端到端测试',
      raw_payload: {
        session_id: 'sess_e2e_001',
        summary: '客户反馈 App 密码正确但无法登录',
        category_code: 'ticket.incident.app_login',
        ticket_category: 'incident',
      },
    });
    const intakeId = intakeData.id as string;
    expect(intakeId).toBeDefined();

    // Step 2: Match
    const { data: matchData } = await post(`/api/intakes/${intakeId}/match`, {});
    expect(matchData.success).toBe(true);
    expect(matchData.resolution_action).toBe('create_new_thread');
    const threadId = matchData.thread_id as string;
    expect(threadId).toBeDefined();

    // Verify thread was created
    const { data: threadData } = await get(`/api/issue-threads/${threadId}`);
    expect(threadData.status).toBe('open');
    expect(threadData.customer_phone).toBe('13800200001');

    // Step 3: Generate draft
    const { status: draftStatus, data: draftData } = await post('/api/drafts/generate', {
      intake_id: intakeId,
    });
    expect(draftStatus).toBe(201);
    const draftId = draftData.id as string;
    expect(draftId).toBeDefined();

    // Step 4: Verify draft content
    const { data: draftDetail } = await get(`/api/drafts/${draftId}`);
    expect(draftDetail.target_type).toBe('ticket');
    expect(draftDetail.customer_phone).toBe('13800200001');
    expect(draftDetail.status).toBe('pending_review');

    // Step 5: Edit draft (optional)
    const { status: editStatus } = await patch(`/api/drafts/${draftId}`, {
      title: 'App 登录异常 - 已编辑',
      priority: 'high',
    });
    expect(editStatus).toBe(200);

    // Step 6: Confirm draft → materialize
    const { status: confirmStatus, data: confirmData } = await post(`/api/drafts/${draftId}/confirm`, {
      reviewed_by: 'agent_test',
    });
    expect(confirmStatus).toBe(200);
    expect(confirmData.success).toBe(true);
    expect(confirmData.item_id).toBeDefined();
    const itemId = confirmData.item_id as string;

    // Step 7: Verify formal work item was created
    const { data: itemDetail } = await get(`/api/work-items/${itemId}`);
    expect(itemDetail.item).toBeDefined();
    const item = itemDetail.item as any;
    expect(item.type).toBe('ticket');
    expect(item.title).toBe('App 登录异常 - 已编辑');
    expect(item.priority).toBe('high');
    expect(item.customer_phone).toBe('13800200001');

    // Step 8: Verify relations exist
    const relations = itemDetail.relations as any[];
    const sourceIntake = relations.find((r: any) => r.related_type === 'source_intake');
    expect(sourceIntake).toBeDefined();
    expect(sourceIntake.related_id).toBe(intakeId);

    const sourceDraft = relations.find((r: any) => r.related_type === 'source_draft');
    expect(sourceDraft).toBeDefined();
    expect(sourceDraft.related_id).toBe(draftId);

    // Step 9: Verify intake is materialized
    const { data: finalIntake } = await get(`/api/intakes/${intakeId}`);
    expect(finalIntake.status).toBe('materialized');
    expect(finalIntake.materialized_item_id).toBe(itemId);
  });
});

describe('Draft discard flow', () => {
  test('discard sets draft and intake to discarded', async () => {
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      customer_phone: '13800300001',
      subject: '将被丢弃的草稿',
      raw_payload: { summary: '测试丢弃' },
    });
    const intakeId = intakeData.id as string;

    await post(`/api/intakes/${intakeId}/match`, {});

    const { data: draftData } = await post('/api/drafts/generate', {
      intake_id: intakeId,
    });
    const draftId = draftData.id as string;

    const { status } = await post(`/api/drafts/${draftId}/discard`, {
      reviewed_by: 'agent_test',
    });
    expect(status).toBe(200);

    // Draft should be discarded
    const { data: draftDetail } = await get(`/api/drafts/${draftId}`);
    expect(draftDetail.status).toBe('discarded');

    // Intake should be discarded
    const { data: intakeDetail } = await get(`/api/intakes/${intakeId}`);
    expect(intakeDetail.status).toBe('discarded');
  });
});

describe('Issue threads', () => {
  test('GET /api/issue-threads lists threads', async () => {
    const { status, data } = await get('/api/issue-threads');
    expect(status).toBe(200);
    expect((data.items as any[]).length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/issue-threads/:id returns thread with intakes', async () => {
    const { status, data } = await get('/api/issue-threads/thrd-demo-001');
    expect(status).toBe(200);
    expect(data.customer_phone).toBe('13800000001');
    expect(data.intakes).toBeDefined();
  });
});

describe('Merge reviews', () => {
  test('GET /api/merge-reviews lists reviews', async () => {
    const { status, data } = await get('/api/merge-reviews');
    expect(status).toBe(200);
    expect(data.items).toBeDefined();
  });

  test('approve/reject returns 404 for unknown id', async () => {
    const { status: s1 } = await post('/api/merge-reviews/nonexistent/approve', {});
    expect(s1).toBe(404);
    const { status: s2 } = await post('/api/merge-reviews/nonexistent/reject', {});
    expect(s2).toBe(404);
  });
});
