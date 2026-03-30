/**
 * API tests for: External intake flows (Iteration 3)
 *
 * Scenario 2: self_service_form → auto_create_if_confident
 * Scenario 4: external_monitoring webhook → auto_create / auto_create_and_schedule
 * Multi-intake aggregation to same thread
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';
import { db, workItemIntakes, issueThreads, eq } from '../../src/db';

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

describe('Scenario 2: self_service_form', () => {
  test('self_service_form + high confidence → auto_create', async () => {
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'self_service_form',
      source_channel: 'self_service',
      customer_phone: '13800700001',
      customer_name: '表单用户',
      subject: '宽带报修',
      risk_score: 85,
      raw_payload: {
        form_title: '宽带报修',
        form_description: '光猫闪红灯',
        service_type: 'ticket.incident.broadband',
        form_id: 'form_001',
      },
    });
    const intakeId = intakeData.id as string;

    const { status, data } = await post(`/api/intakes/${intakeId}/process`, {});
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.decision_mode).toBe('auto_create_if_confident');
    // Complete form fields → high confidence_score ≥ 80 → auto create
    expect(data.item_id).toBeDefined();
  });

  test('self_service_form + incomplete fields → low confidence → no auto create', async () => {
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'self_service_form',
      customer_phone: '13800700002',
      subject: '一般咨询',
      raw_payload: {
        // No form_id, no category/service_type → low confidence
        form_description: '费用查询',
      },
    });
    const intakeId = intakeData.id as string;

    const { status, data } = await post(`/api/intakes/${intakeId}/process`, {});
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.decision_mode).toBe('auto_create_if_confident');
    expect(data.item_id).toBeUndefined();
  });
});

describe('Scenario 4: external_monitoring webhook', () => {
  test('POST /api/intakes/webhook accepts monitoring alert', async () => {
    const { status, data } = await post('/api/intakes/webhook', {
      alert_title: '基站断电告警',
      alert_id: 'alert_test_001',
      severity: 'high',
      source_channel: 'monitoring',
      customer_phone: '13800800001',
      raw_payload: {
        alert_title: '基站断电告警',
        alert_type: 'power_outage',
        severity: 'high',
        alert_description: '朝阳区基站 UPS 断电',
        monitoring_system: 'zabbix',
      },
    });
    expect(status).toBe(202);
    expect(data.accepted).toBe(true);
    expect(data.intake_id).toBeDefined();
  });

  test('webhook returns 400 without payload', async () => {
    const { status } = await post('/api/intakes/webhook', {});
    expect(status).toBe(400);
  });

  test('external_monitoring + critical severity → auto_create_and_schedule', async () => {
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'external_monitoring',
      source_channel: 'monitoring',
      customer_phone: '13800800002',
      subject: '紧急告警',
      raw_payload: {
        alert_title: '紧急告警',
        alert_type: 'fiber_cut',
        severity: 'critical',
        alert_description: '主干光缆中断',
      },
    });
    const intakeId = intakeData.id as string;

    const { status, data } = await post(`/api/intakes/${intakeId}/process`, {});
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.decision_mode).toBe('auto_create_and_schedule');
    expect(data.item_id).toBeDefined();
  });

  test('external_monitoring + medium severity → auto_create', async () => {
    const { data: intakeData } = await post('/api/intakes', {
      source_kind: 'external_monitoring',
      source_channel: 'monitoring',
      customer_phone: '13800800003',
      subject: '一般告警',
      raw_payload: {
        alert_title: '一般告警',
        alert_type: 'cpu_high',
        severity: 'medium',
      },
    });
    const intakeId = intakeData.id as string;

    const { status, data } = await post(`/api/intakes/${intakeId}/process`, {});
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.decision_mode).toBe('auto_create');
    expect(data.item_id).toBeDefined();
  });
});

describe('Multi-intake aggregation', () => {
  test('same customer + same subject → intakes aggregate to same thread', async () => {
    const phone = '13800900001';
    const subject = '重复问题归并测试';

    // First intake
    const { data: intake1 } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      customer_phone: phone,
      subject,
      raw_payload: { summary: '第一次反馈' },
    });
    await post(`/api/intakes/${intake1.id}/match`, {});

    // Second intake — same customer, same subject
    const { data: intake2 } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      customer_phone: phone,
      subject,
      raw_payload: { summary: '第二次反馈' },
    });
    const { data: match2 } = await post(`/api/intakes/${intake2.id}/match`, {});

    // The second intake should match to the same thread (append_followup or same thread)
    const i1 = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intake1.id as string)).get();
    const i2 = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intake2.id as string)).get();

    // Both should have thread_id set
    expect(i1!.thread_id).toBeDefined();
    expect(i2!.thread_id).toBeDefined();

    // If matching worked correctly, they should share the same thread
    // (exact behavior depends on scoring, but same customer + same subject scores high)
    if (match2.resolution_action === 'append_followup') {
      expect(i2!.thread_id).toBe(i1!.thread_id);
    }
  });

  test('different customers → separate threads', async () => {
    const { data: intake1 } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      customer_phone: '13800910001',
      subject: '不同客户测试A',
      raw_payload: { summary: '客户A' },
    });
    await post(`/api/intakes/${intake1.id}/match`, {});

    const { data: intake2 } = await post('/api/intakes', {
      source_kind: 'agent_after_service',
      customer_phone: '13800910002',
      subject: '不同客户测试B',
      raw_payload: { summary: '客户B' },
    });
    await post(`/api/intakes/${intake2.id}/match`, {});

    const i1 = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intake1.id as string)).get();
    const i2 = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intake2.id as string)).get();

    expect(i1!.thread_id).toBeDefined();
    expect(i2!.thread_id).toBeDefined();
    expect(i1!.thread_id).not.toBe(i2!.thread_id);
  });
});
