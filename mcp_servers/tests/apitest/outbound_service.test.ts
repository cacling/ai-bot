/**
 * API tests for: src/services/outbound_service.ts (Port: 18006)
 * Tools: record_call_result, send_followup_sms, create_callback_task, record_marketing_result
 * Mock: backendPost (mock_apis HTTP calls)
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool } from './helpers';
import { type Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  const createServer = await loadService('src/services/outbound_service.ts');
  client = await createTestClient(createServer);
});

// ── record_call_result ──────────────────────────────────────────────────────

describe('record_call_result', () => {
  test('records ptp result with valid ptp_date', async () => {
    const ptpDate = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    mockBackend({
      post: () => ({
        success: true,
        result_id: 'RES-001',
        next_action: 'wait_for_payment',
      }),
    });

    const res = await callTool(client, 'record_call_result', {
      result: 'ptp',
      ptp_date: ptpDate,
      remark: 'Customer promised to pay',
    });

    expect(res.result).toBe('ptp');
    expect(res.result_id).toBe('RES-001');
    expect(res.result_category).toBe('positive');
    expect(res.ptp_date).toBe(ptpDate);
    expect(res.remark).toBe('Customer promised to pay');
    expect(res.next_action).toBe('wait_for_payment');
  });

  test('rejects ptp without ptp_date (returns ptp_date_required)', async () => {
    const res = await callTool(client, 'record_call_result', {
      result: 'ptp',
    });

    expect(res.result).toBe('ptp');
    expect(res.remark).toBe('ptp_date_required');
    expect(res.ptp_date).toBeNull();
  });

  test('rejects ptp_date more than 7 days in future', async () => {
    const farDate = new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0];

    const res = await callTool(client, 'record_call_result', {
      result: 'ptp',
      ptp_date: farDate,
    });

    expect(res.result).toBe('ptp');
    expect(res.remark).toBe('ptp_date_exceeds_limit');
    expect(res.ptp_date).toBe(farDate);
  });

  test('rejects ptp_date in the past', async () => {
    const pastDate = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];

    const res = await callTool(client, 'record_call_result', {
      result: 'ptp',
      ptp_date: pastDate,
    });

    expect(res.result).toBe('ptp');
    expect(res.remark).toBe('ptp_date_in_past');
  });

  test('categorizes ptp/converted/callback as positive', async () => {
    mockBackend({ post: () => ({ success: true }) });

    for (const result of ['converted', 'callback']) {
      const res = await callTool(client, 'record_call_result', { result });
      expect(res.result_category).toBe('positive');
    }
  });

  test('categorizes refusal/non_owner/dnd as negative', async () => {
    mockBackend({ post: () => ({ success: true }) });

    for (const result of ['refusal', 'non_owner', 'dnd']) {
      const res = await callTool(client, 'record_call_result', { result });
      expect(res.result_category).toBe('negative');
    }
  });

  test('categorizes verify_failed as negative', async () => {
    mockBackend({ post: () => ({ success: true }) });

    const res = await callTool(client, 'record_call_result', { result: 'verify_failed' });
    expect(res.result_category).toBe('negative');
  });

  test('categorizes busy/no_answer/dispute/power_off as neutral', async () => {
    mockBackend({ post: () => ({ success: true }) });

    for (const result of ['busy', 'no_answer', 'dispute', 'power_off']) {
      const res = await callTool(client, 'record_call_result', { result });
      expect(res.result_category).toBe('neutral');
    }
  });

  test('records refusal result with remark', async () => {
    mockBackend({ post: () => ({ success: true, result_id: 'RES-002' }) });

    const res = await callTool(client, 'record_call_result', {
      result: 'refusal',
      remark: 'Customer refused to pay',
    });

    expect(res.result).toBe('refusal');
    expect(res.result_category).toBe('negative');
    expect(res.remark).toBe('Customer refused to pay');
  });

  test('records callback result with callback_time', async () => {
    mockBackend({ post: () => ({ success: true, result_id: 'RES-003' }) });

    const res = await callTool(client, 'record_call_result', {
      result: 'callback',
      callback_time: '2026-03-28T14:00:00',
    });

    expect(res.result).toBe('callback');
    expect(res.result_category).toBe('positive');
    expect(res.callback_time).toBe('2026-03-28T14:00:00');
  });

  test('returns fallback when backend throws', async () => {
    mockBackend({ post: () => { throw new Error('timeout'); } });

    const res = await callTool(client, 'record_call_result', {
      result: 'no_answer',
    });

    expect(res.result).toBe('no_answer');
    expect(res.result_category).toBe('neutral');
  });
});

// ── send_followup_sms ───────────────────────────────────────────────────────

describe('send_followup_sms', () => {
  test('sends payment_link SMS successfully', async () => {
    mockBackend({
      post: () => ({
        success: true,
        event_id: 'EVT-001',
        status: 'sent',
      }),
    });

    const res = await callTool(client, 'send_followup_sms', {
      phone: '13800001111',
      sms_type: 'payment_link',
    });

    expect(res.phone).toBe('13800001111');
    expect(res.sms_type).toBe('payment_link');
    expect(res.status).toBe('sent');
    expect(res.event_id).toBe('EVT-001');
  });

  test('sends plan_detail SMS in marketing context', async () => {
    mockBackend({ post: () => ({ success: true, status: 'sent' }) });

    const res = await callTool(client, 'send_followup_sms', {
      phone: '13800001111',
      sms_type: 'plan_detail',
      context: 'marketing',
    });

    expect(res.status).toBe('sent');
    expect(res.context).toBe('marketing');
  });

  test('blocks collection SMS during quiet hours (21:00-08:00)', async () => {
    // We need to mock Date to simulate quiet hours
    // The service uses `new Date().getHours()`, so we mock it
    const origDate = globalThis.Date;
    const mockDate = class extends origDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(2026, 2, 26, 22, 0, 0); // 22:00 = quiet hours
        } else {
          // @ts-ignore
          super(...args);
        }
      }
      static now() { return new origDate(2026, 2, 26, 22, 0, 0).getTime(); }
    } as any;
    globalThis.Date = mockDate;

    try {
      const res = await callTool(client, 'send_followup_sms', {
        phone: '13800001111',
        sms_type: 'payment_link',
        context: 'collection',
      });

      expect(res.status).toBe('blocked_quiet_hours');
    } finally {
      globalThis.Date = origDate;
    }
  });

  test('marketing context blocks payment_link SMS type', async () => {
    const res = await callTool(client, 'send_followup_sms', {
      phone: '13800001111',
      sms_type: 'payment_link',
      context: 'marketing',
    });

    expect(res.status).toBe('blocked_invalid_type');
    expect(res.context).toBe('marketing');
  });

  test('marketing context allows plan_detail, product_detail, callback_reminder', async () => {
    mockBackend({ post: () => ({ success: true, status: 'sent' }) });

    for (const smsType of ['plan_detail', 'product_detail', 'callback_reminder']) {
      const res = await callTool(client, 'send_followup_sms', {
        phone: '13800001111',
        sms_type: smsType,
        context: 'marketing',
      });
      expect(res.status).toBe('sent');
    }
  });

  test('returns fallback status=sent when backend throws', async () => {
    mockBackend({ post: () => { throw new Error('timeout'); } });

    const res = await callTool(client, 'send_followup_sms', {
      phone: '13800001111',
      sms_type: 'callback_reminder',
    });

    expect(res.status).toBe('sent');
  });
});

// ── create_callback_task ────────────────────────────────────────────────────

describe('create_callback_task', () => {
  test('creates callback task with all fields', async () => {
    mockBackend({
      post: () => ({
        success: true,
        callback_task_id: 'CB-ABC123',
      }),
    });

    const res = await callTool(client, 'create_callback_task', {
      original_task_id: 'TASK-001',
      callback_phone: '13800001111',
      preferred_time: '2026-03-28T14:00:00',
      customer_name: 'Zhang San',
      product_name: '5G Unlimited',
    });

    expect(res.callback_task_id).toBe('CB-ABC123');
    expect(res.original_task_id).toBe('TASK-001');
    expect(res.callback_phone).toBe('13800001111');
    expect(res.preferred_time).toBe('2026-03-28T14:00:00');
    expect(res.customer_name).toBe('Zhang San');
    expect(res.product_name).toBe('5G Unlimited');
    expect(res.status).toBe('pending');
  });

  test('uses generated callback_task_id when backend omits it', async () => {
    mockBackend({
      post: () => ({ success: true }),
    });

    const res = await callTool(client, 'create_callback_task', {
      original_task_id: 'TASK-002',
      callback_phone: '13800002222',
      preferred_time: '2026-03-29T10:00:00',
    });

    expect(res.callback_task_id).toBeTruthy();
    expect((res.callback_task_id as string).startsWith('CB-')).toBe(true);
    expect(res.customer_name).toBeNull();
    expect(res.product_name).toBeNull();
    expect(res.status).toBe('pending');
  });

  test('returns error when backend throws', async () => {
    mockBackend({
      post: () => { throw new Error('connection refused'); },
    });

    const res = await callTool(client, 'create_callback_task', {
      original_task_id: 'TASK-003',
      callback_phone: '13800003333',
      preferred_time: '2026-03-30T09:00:00',
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('connection refused');
  });
});

// ── record_marketing_result ─────────────────────────────────────────────────

describe('record_marketing_result', () => {
  test('records converted result with conversion_tag=converted', async () => {
    mockBackend({
      post: () => ({
        success: true,
        record_id: 'MKT-001',
      }),
    });

    const res = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-001',
      phone: '13800001111',
      result: 'converted',
    });

    expect(res.campaign_id).toBe('CAMP-001');
    expect(res.phone).toBe('13800001111');
    expect(res.result).toBe('converted');
    expect(res.conversion_tag).toBe('converted');
    expect(res.is_dnd).toBe(false);
    expect(res.dnd_note).toBeNull();
    expect(res.is_callback).toBe(false);
    expect(res.record_id).toBe('MKT-001');
  });

  test('records callback result with conversion_tag=warm_lead and is_callback=true', async () => {
    mockBackend({ post: () => ({ success: true }) });

    const res = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-002',
      phone: '13800001111',
      result: 'callback',
      callback_time: '2026-03-28T15:00:00',
    });

    expect(res.conversion_tag).toBe('warm_lead');
    expect(res.is_callback).toBe(true);
    expect(res.callback_time).toBe('2026-03-28T15:00:00');
  });

  test('records not_interested result with conversion_tag=cold', async () => {
    mockBackend({ post: () => ({ success: true }) });

    const res = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-003',
      phone: '13800001111',
      result: 'not_interested',
    });

    expect(res.conversion_tag).toBe('cold');
    expect(res.is_dnd).toBe(false);
  });

  test('records dnd result with is_dnd=true and dnd_note', async () => {
    mockBackend({ post: () => ({ success: true }) });

    const res = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-004',
      phone: '13800001111',
      result: 'dnd',
    });

    expect(res.conversion_tag).toBe('dnd');
    expect(res.is_dnd).toBe(true);
    expect(res.dnd_note).toContain('免打扰名单');
  });

  test('records wrong_number result with conversion_tag=lost', async () => {
    mockBackend({ post: () => ({ success: true }) });

    const res = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-005',
      phone: '13800001111',
      result: 'wrong_number',
    });

    expect(res.conversion_tag).toBe('lost');
  });

  test('records no_answer with conversion_tag=cold (default)', async () => {
    mockBackend({ post: () => ({ success: true }) });

    const res = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-006',
      phone: '13800001111',
      result: 'no_answer',
    });

    expect(res.conversion_tag).toBe('cold');
  });

  test('records busy with conversion_tag=cold (default)', async () => {
    mockBackend({ post: () => ({ success: true }) });

    const res = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-007',
      phone: '13800001111',
      result: 'busy',
    });

    expect(res.conversion_tag).toBe('cold');
  });

  test('backend is_dnd overrides local isDND calculation', async () => {
    mockBackend({
      post: () => ({
        success: true,
        is_dnd: true, // Backend says DND even though result is not 'dnd'
      }),
    });

    const res = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-008',
      phone: '13800001111',
      result: 'no_answer',
    });

    expect(res.is_dnd).toBe(true);
    expect(res.dnd_note).toContain('免打扰名单');
  });

  test('returns fallback when backend throws', async () => {
    mockBackend({ post: () => { throw new Error('timeout'); } });

    const res = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-009',
      phone: '13800001111',
      result: 'converted',
    });

    expect(res.result).toBe('converted');
    expect(res.conversion_tag).toBe('converted');
    expect(res.is_dnd).toBe(false);
    expect(res.record_id).toBeUndefined();
  });
});
