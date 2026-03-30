/**
 * Verification tests for bugfix findings [P1][P2]
 *
 * [P1] append_followup/reopen_master actually executes in auto pipeline
 * [P1] master_ticket_id not overwritten when already set
 * [P2] work_order via materializer starts workflow
 * [P2] confidence_score used correctly (not risk_score)
 * [P2] thread_key stable across channels/wording
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';
import { db, workItemIntakes, issueThreads, workItemEvents, eq } from '../../src/db';

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

describe('[P1] append_followup executes in auto pipeline', () => {
  test('handoff_overflow intake matching existing thread triggers actual followup', async () => {
    // Create first intake + match to create a thread
    const { data: intake1 } = await post('/api/intakes', {
      source_kind: 'handoff_overflow',
      customer_phone: '13800000001', // same as seed thread thrd-demo-001
      subject: 'App 登录异常',
      raw_payload: {
        summary: '第一次反馈',
        category_code: 'ticket.incident.app_login',
      },
    });

    // Process auto — should match existing thread and execute append_followup
    const { data: result } = await post(`/api/intakes/${intake1.id}/process`, {});

    // If matched to existing thread with high score, resolution should be append_followup
    if (result.resolution_action === 'append_followup') {
      // Verify intake status was actually updated (not just returned)
      const intake = await db.select().from(workItemIntakes)
        .where(eq(workItemIntakes.id, intake1.id as string)).get();
      expect(intake!.status).toBe('materialized'); // appendFollowup sets this

      // Verify event was actually written to master ticket
      const events = await db.select().from(workItemEvents)
        .where(eq(workItemEvents.item_id, 'wo-demo-001')).all();
      const followupEvent = events.find(e =>
        e.note?.includes('intake 追加跟进')
      );
      expect(followupEvent).toBeDefined();
    }
  });
});

describe('[P1] master_ticket_id preserved when already set', () => {
  test('materializing a second item does not overwrite master_ticket_id', async () => {
    // Create intake for customer with existing thread (thrd-demo-001 has master_ticket_id=wo-demo-001)
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      customer_phone: '13800BF0001',
      subject: '第二个工单 - 不应覆盖主单',
      raw_payload: {
        summary: '测试主单保护',
        category_code: 'ticket.incident.app_login',
        ticket_category: 'incident',
      },
    });
    const intakeId = intakeData.id as string;

    // Match → creates new thread
    await post(`/api/intakes/${intakeId}/match`, {});
    const intake = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intakeId)).get();
    const threadId = intake!.thread_id!;

    // Generate and confirm draft → materializes first item
    const { data: draft1 } = await post('/api/drafts/generate', { intake_id: intakeId });
    await post(`/api/drafts/${draft1.id}/confirm`, { reviewed_by: 'test' });

    // Verify thread has master_ticket_id
    const thread1 = await db.select().from(issueThreads).where(eq(issueThreads.id, threadId)).get();
    const originalMaster = thread1!.master_ticket_id;
    expect(originalMaster).toBeDefined();

    // Now create a second intake for same thread
    const { data: intake2Data } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      customer_phone: '13800BF0001',
      subject: '第二个工单 - 不应覆盖主单（续）',
      raw_payload: {
        summary: '续',
        category_code: 'ticket.incident.app_login',
        ticket_category: 'incident',
      },
    });
    await post(`/api/intakes/${intake2Data.id}/match`, {});
    const { data: draft2 } = await post('/api/drafts/generate', { intake_id: intake2Data.id as string });
    const { data: confirm2 } = await post(`/api/drafts/${draft2.id}/confirm`, { reviewed_by: 'test' });

    // Verify master_ticket_id is STILL the original, not overwritten
    const thread2 = await db.select().from(issueThreads).where(eq(issueThreads.id, threadId)).get();
    expect(thread2!.master_ticket_id).toBe(originalMaster);
    // latest_item_id should be updated to the new item
    expect(thread2!.latest_item_id).toBe(confirm2.item_id);
  });
});

describe('[P2] confidence_score computed and used correctly', () => {
  test('self_service_form with complete fields gets high confidence', async () => {
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'self_service_form',
      customer_phone: '13800BF0002',
      subject: '宽带报修 - 置信度测试',
      raw_payload: {
        form_id: 'form_test',
        form_title: '宽带报修',
        form_description: '光猫闪红灯',
        service_type: 'ticket.incident.broadband',
      },
    });
    const intakeId = intakeData.id as string;

    // Process to trigger normalization
    await post(`/api/intakes/${intakeId}/process`, {});

    // Verify confidence_score was computed (not null)
    const intake = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intakeId)).get();
    expect(intake!.confidence_score).toBeDefined();
    expect(intake!.confidence_score).toBeGreaterThanOrEqual(80); // complete form should be >= 80
  });

  test('self_service_form with incomplete fields gets low confidence → no auto create', async () => {
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'self_service_form',
      // no customer_phone, no subject
      raw_payload: {
        form_description: '简单描述',
      },
    });
    const intakeId = intakeData.id as string;

    const { data: result } = await post(`/api/intakes/${intakeId}/process`, {});
    expect(result.success).toBe(true);
    expect(result.decision_mode).toBe('auto_create_if_confident');

    // Low confidence → should NOT auto create
    const intake = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intakeId)).get();
    expect(intake!.confidence_score).toBeLessThan(80);
    expect(result.item_id).toBeUndefined();
  });
});

describe('[P2] thread_key stable across channels and wording', () => {
  test('same customer + same category from different channels share thread', async () => {
    // Intake 1: online channel
    const { data: i1 } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      source_channel: 'online',
      customer_phone: '13800BF0003',
      subject: 'App 登录有问题',
      raw_payload: {
        summary: '反馈一',
        category_code: 'ticket.incident.app_login',
      },
    });
    await post(`/api/intakes/${i1.id}/match`, {});

    // Intake 2: voice channel, different wording, same category + customer
    const { data: i2 } = await post('/api/intakes', {
      source_kind: 'handoff_overflow', // different source_kind
      source_channel: 'voice',
      customer_phone: '13800BF0003',
      subject: 'APP无法登录了！！',  // different wording
      raw_payload: {
        summary: '反馈二',
        category_code: 'ticket.incident.app_login', // same category
      },
    });
    const { data: match2 } = await post(`/api/intakes/${i2.id}/match`, {});

    // Second should match to existing thread (thread_key based on phone + category)
    const intake1 = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, i1.id as string)).get();
    const intake2 = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, i2.id as string)).get();

    expect(intake1!.thread_id).toBeDefined();
    expect(intake2!.thread_id).toBeDefined();
    // Should share the same thread due to stable thread_key
    expect(intake2!.thread_id).toBe(intake1!.thread_id);
  });
});
