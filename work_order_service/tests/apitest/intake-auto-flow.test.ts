/**
 * API tests for: Automatic intake processing (Iteration 2)
 *
 * Tests handoff_overflow and emotion_escalation auto-create flows
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

describe('POST /api/intakes/:id/process — auto pipeline', () => {
  test('handoff_overflow → auto_create → formal ticket', async () => {
    // Create intake
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'handoff_overflow',
      source_channel: 'voice',
      customer_phone: '13800400001',
      customer_name: '自动建单测试用户',
      subject: '转人工超时自动建单',
      raw_payload: {
        session_id: 'sess_auto_001',
        summary: '客户等待转人工超时，系统自动创建工单',
        category_code: 'ticket.incident.service_suspend',
        ticket_category: 'incident',
      },
    });
    const intakeId = intakeData.id as string;

    // Process auto
    const { status, data } = await post(`/api/intakes/${intakeId}/process`, {});
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.decision_mode).toBe('auto_create');
    expect(data.item_id).toBeDefined();

    // Verify formal work item
    const { data: itemDetail } = await get(`/api/work-items/${data.item_id}`);
    expect(itemDetail.item).toBeDefined();
    const item = itemDetail.item as any;
    expect(item.type).toBe('ticket');
    expect(item.customer_phone).toBe('13800400001');

    // Verify intake is materialized
    const { data: intakeDetail } = await get(`/api/intakes/${intakeId}`);
    expect(intakeDetail.status).toBe('materialized');
    expect(intakeDetail.materialized_item_id).toBe(data.item_id);
  });

  test('emotion_escalation + high risk → auto_create → formal ticket', async () => {
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'emotion_escalation',
      customer_phone: '13800400002',
      subject: '情绪升级自动建单',
      risk_score: 85,
      raw_payload: {
        summary: '客户情绪激动投诉',
        ticket_category: 'complaint',
      },
    });
    const intakeId = intakeData.id as string;

    const { status, data } = await post(`/api/intakes/${intakeId}/process`, {});
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.decision_mode).toBe('auto_create');
    expect(data.item_id).toBeDefined();
  });

  test('emotion_escalation + low risk → auto_create_if_confident → no auto create', async () => {
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'emotion_escalation',
      customer_phone: '13800400003',
      subject: '低风险情绪升级',
      risk_score: 30,
      raw_payload: {
        summary: '客户轻微不满',
      },
    });
    const intakeId = intakeData.id as string;

    const { status, data } = await post(`/api/intakes/${intakeId}/process`, {});
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.decision_mode).toBe('auto_create_if_confident');
    // Low risk_score (30) < 80 threshold → no auto create
    expect(data.item_id).toBeUndefined();
  });

  test('agent_after_service → manual_confirm → no auto create', async () => {
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      customer_phone: '13800400004',
      subject: '坐席服务后手动确认',
      raw_payload: {
        summary: '需要人工确认',
      },
    });
    const intakeId = intakeData.id as string;

    const { status, data } = await post(`/api/intakes/${intakeId}/process`, {});
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.decision_mode).toBe('manual_confirm');
    expect(data.item_id).toBeUndefined();
  });

  test('returns 404 for unknown intake', async () => {
    const { status } = await post('/api/intakes/nonexistent/process', {});
    expect(status).toBe(404);
  });
});
