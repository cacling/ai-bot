/**
 * work-order-client.ts 单元测试 — mock fetch 验证请求格式
 */
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

// Mock fetch globally
const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof mock>;

beforeEach(() => {
  fetchMock = mock(() =>
    Promise.resolve(new Response(JSON.stringify({ success: true, id: 'wi_test_001' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })),
  );
  globalThis.fetch = fetchMock as any;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Dynamic import to pick up mocked fetch
async function loadClient() {
  // Clear module cache to force re-evaluation with mocked fetch
  delete require.cache[require.resolve('../../src/services/work-order-client')];
  return import('../../src/services/work-order-client');
}

describe('createTicketFromSkill', () => {
  test('sends correct POST to /api/tickets', async () => {
    const client = await loadClient();
    const result = await client.createTicketFromSkill({
      session_id: 'sess_001',
      phone: '13800000001',
      customer_name: '张三',
      skill_id: 'telecom-app',
      skill_version: 1,
      step_id: 'human_step',
      instance_id: 'inst_001',
      title: 'App 登录异常 - 转人工',
      ticket_category: 'incident',
      category_code: 'ticket.incident.app_login',
      priority: 'high',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/tickets');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string);
    expect(body.customer_phone).toBe('13800000001');
    expect(body.ticket_category).toBe('incident');
    expect(body.category_code).toBe('ticket.incident.app_login');
    expect(body.source_session_id).toBe('sess_001');
    expect(body.source_skill_id).toBe('telecom-app');
  });
});

describe('createWorkOrderFromSkill', () => {
  test('sends correct POST to /api/work-orders', async () => {
    const client = await loadClient();
    const result = await client.createWorkOrderFromSkill({
      session_id: 'sess_002',
      phone: '13800000002',
      skill_id: 'telecom-app',
      step_id: 'human_step',
      instance_id: 'inst_002',
      title: '人工解锁',
      work_type: 'execution',
      category_code: 'work_order.review.manual_unlock',
      queue_code: 'specialist',
    });

    expect(result.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/work-orders');

    const body = JSON.parse(init.body as string);
    expect(body.work_type).toBe('execution');
    expect(body.category_code).toBe('work_order.review.manual_unlock');
    expect(body.queue_code).toBe('specialist');
  });
});

describe('createAppointmentFromSkill', () => {
  test('sends POST to /api/work-orders/:id/appointments', async () => {
    const client = await loadClient();
    await client.createAppointmentFromSkill('wo_parent_001', {
      appointment_type: 'callback',
      category_code: 'appointment.callback.result_check',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/work-orders/wo_parent_001/appointments');

    const body = JSON.parse(init.body as string);
    expect(body.appointment_type).toBe('callback');
    expect(body.category_code).toBe('appointment.callback.result_check');
  });
});

describe('signalWorkflow', () => {
  test('sends POST to /api/workflows/runs/:id/signal', async () => {
    fetchMock = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })),
    );
    globalThis.fetch = fetchMock as any;

    const client = await loadClient();
    await client.signalWorkflow('wfr_001', 'callback_done', { approved: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/workflows/runs/wfr_001/signal');

    const body = JSON.parse(init.body as string);
    expect(body.signal).toBe('callback_done');
    expect(body.payload).toEqual({ approved: true });
  });
});

describe('error handling', () => {
  test('returns ok:false on HTTP error', async () => {
    fetchMock = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })),
    );
    globalThis.fetch = fetchMock as any;

    const client = await loadClient();
    const result = await client.createTicketFromSkill({
      session_id: 'sess_err',
      phone: '13800000099',
      skill_id: 'test',
      step_id: 'step1',
      instance_id: 'inst_err',
      title: '测试',
      ticket_category: 'incident',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('returns ok:false on network error', async () => {
    fetchMock = mock(() => Promise.reject(new Error('ECONNREFUSED')));
    globalThis.fetch = fetchMock as any;

    const client = await loadClient();
    const result = await client.createTicketFromSkill({
      session_id: 'sess_net',
      phone: '13800000099',
      skill_id: 'test',
      step_id: 'step1',
      instance_id: 'inst_net',
      title: '测试',
      ticket_category: 'incident',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});
