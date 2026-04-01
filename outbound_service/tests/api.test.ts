/**
 * Outbound Service API Tests
 *
 * 测试核心 API：campaigns CRUD, tasks CRUD, results 写入/查询, test-personas
 * 前置条件：outbound.db 已 seed + cdp_service 已启动（测试 persona 需要 CDP）
 */
import { describe, test, expect, beforeAll } from 'bun:test';

const BASE = `http://localhost:${process.env.OUTBOUND_SERVICE_PORT ?? 18021}`;
const TS = Date.now();
const TEST_CAMPAIGN_ID = `CMP-TEST-${TS}`;
const TEST_TASK_ID = `T-TEST-${TS}`;

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, data: await res.json() };
}

async function put(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

// ── Health ────────────────────────────────────────────────────────────────

describe('Health', () => {
  test('GET /health returns ok', async () => {
    const { data } = await get('/health');
    expect(data.status).toBe('ok');
    expect(data.service).toBe('outbound-service');
    expect(data.modules).toContain('campaigns');
    expect(data.modules).toContain('tasks');
    expect(data.modules).toContain('results');
    expect(data.modules).toContain('test-personas');
  });
});

// ── Campaigns ────────────────────────────────────────────────────────────

describe('Campaigns', () => {
  test('list all campaigns (seeded)', async () => {
    const { status, data } = await get('/api/outbound/campaigns');
    expect(status).toBe(200);
    expect(data.campaigns.length).toBeGreaterThanOrEqual(4);
  });

  test('filter campaigns by status', async () => {
    const { status, data } = await get('/api/outbound/campaigns?status=active');
    expect(status).toBe(200);
    for (const c of data.campaigns) {
      expect(c.status).toBe('active');
    }
  });

  test('get single campaign by id', async () => {
    const { status, data } = await get('/api/outbound/campaigns/CMP-UP-100G');
    expect(status).toBe(200);
    expect(data.campaign_name).toBe('畅享 50G 升级 100G');
    expect(data.offer_type).toBe('plan_upgrade');
  });

  test('get missing campaign returns 404', async () => {
    const { status } = await get('/api/outbound/campaigns/NONEXISTENT');
    expect(status).toBe(404);
  });

  test('create campaign', async () => {
    const { status, data } = await post('/api/outbound/campaigns', {
      campaign_id: TEST_CAMPAIGN_ID,
      campaign_name: 'Test Campaign',
      offer_type: 'plan_upgrade',
      headline: 'Test Headline',
      benefit_summary: 'Test Benefits',
      target_segment: 'Test Segment',
      valid_from: '2026-04-01',
      valid_until: '2026-04-30',
    });
    expect(status).toBe(201);
    expect(data.ok).toBe(true);
  });

  test('duplicate campaign returns 409', async () => {
    const { status } = await post('/api/outbound/campaigns', {
      campaign_id: TEST_CAMPAIGN_ID,
      campaign_name: 'Duplicate',
      offer_type: 'plan_upgrade',
      headline: 'X',
      benefit_summary: 'X',
      target_segment: 'X',
      valid_from: '2026-04-01',
      valid_until: '2026-04-30',
    });
    expect(status).toBe(409);
  });

  test('update campaign', async () => {
    const { status, data } = await put('/api/outbound/campaigns/CMP-TEST-001', {
      status: 'paused',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);

    // verify
    const { data: updated } = await get('/api/outbound/campaigns/CMP-TEST-001');
    expect(updated.status).toBe('paused');
  });

  test('create campaign without required fields returns 400', async () => {
    const { status } = await post('/api/outbound/campaigns', { offer_type: 'plan_upgrade' });
    expect(status).toBe(400);
  });
});

// ── Tasks ────────────────────────────────────────────────────────────────

describe('Tasks', () => {
  test('list all tasks (seeded)', async () => {
    const { status, data } = await get('/api/outbound/tasks');
    expect(status).toBe(200);
    expect(data.tasks.length).toBeGreaterThanOrEqual(6);
  });

  test('filter tasks by type=collection', async () => {
    const { status, data } = await get('/api/outbound/tasks?type=collection');
    expect(status).toBe(200);
    expect(data.tasks.length).toBeGreaterThanOrEqual(3);
    for (const t of data.tasks) {
      expect(t.task_type).toBe('collection');
    }
  });

  test('filter tasks by type=marketing', async () => {
    const { data } = await get('/api/outbound/tasks?type=marketing');
    expect(data.tasks.length).toBeGreaterThanOrEqual(3);
    for (const t of data.tasks) {
      expect(t.task_type).toBe('marketing');
    }
  });

  test('get single task by id', async () => {
    const { status, data } = await get('/api/outbound/tasks/C001');
    expect(status).toBe(200);
    expect(data.phone).toBe('13900000001');
    expect(data.task_type).toBe('collection');
  });

  test('get missing task returns 404', async () => {
    const { status } = await get('/api/outbound/tasks/NONEXISTENT');
    expect(status).toBe(404);
  });

  test('create task', async () => {
    const { status, data } = await post('/api/outbound/tasks', {
      id: TEST_TASK_ID,
      phone: '13800009999',
      task_type: 'collection',
      label_zh: 'Test',
      label_en: 'Test',
      data: JSON.stringify({ zh: { case_id: TEST_TASK_ID } }),
    });
    expect(status).toBe(201);
    expect(data.ok).toBe(true);
  });

  test('create task without required fields returns 400', async () => {
    const { status } = await post('/api/outbound/tasks', { phone: '123' });
    expect(status).toBe(400);
  });

  test('update task status', async () => {
    const { status, data } = await put('/api/outbound/tasks/T-TEST-001', {
      status: 'completed',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });
});

// ── Callback Tasks ───────────────────────────────────────────────────────

describe('Callback Tasks', () => {
  test('create callback task', async () => {
    const { status, data } = await post('/api/outbound/tasks/callbacks', {
      original_task_id: 'C001',
      callback_phone: '13800009999',
      preferred_time: '2026-04-02T10:00:00+08:00',
      customer_name: 'Test',
      product_name: 'Test Product',
    });
    expect(status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.task_id).toBeTruthy();
    expect(data.status).toBe('pending');
  });

  test('list callback tasks', async () => {
    const { status, data } = await get('/api/outbound/tasks/callbacks');
    expect(status).toBe(200);
    // seeded + created above
    expect(data.callbacks.length).toBeGreaterThanOrEqual(1);
  });

  test('create callback without required fields returns 400', async () => {
    const { status } = await post('/api/outbound/tasks/callbacks', {
      original_task_id: 'C001',
    });
    expect(status).toBe(400);
  });
});

// ── Call Results ─────────────────────────────────────────────────────────

describe('Call Results', () => {
  test('record call result', async () => {
    const { status, data } = await post('/api/outbound/results/call-results', {
      phone: '13900000001',
      result: 'ptp',
      task_id: 'C001',
      remark: 'Test PTP',
      ptp_date: '2026-04-05',
    });
    expect(status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.result_id).toBeTruthy();
  });

  test('query call results by task_id', async () => {
    const { status, data } = await get('/api/outbound/results/call-results?task_id=C001');
    expect(status).toBe(200);
    expect(data.results.length).toBeGreaterThanOrEqual(1);
    expect(data.results[0].result).toBeTruthy();
  });

  test('record call result without required fields returns 400', async () => {
    const { status } = await post('/api/outbound/results/call-results', {
      task_id: 'C001',
    });
    expect(status).toBe(400);
  });
});

// ── Marketing Results ───────────────────────────────────────────────────

describe('Marketing Results', () => {
  test('record marketing result', async () => {
    const { status, data } = await post('/api/outbound/results/marketing-results', {
      campaign_id: 'CMP-UP-100G',
      phone: '13900000004',
      result: 'converted',
    });
    expect(status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.record_id).toBeTruthy();
  });

  test('query marketing results by campaign_id', async () => {
    const { status, data } = await get('/api/outbound/results/marketing-results?campaign_id=CMP-UP-100G');
    expect(status).toBe(200);
    expect(data.results.length).toBeGreaterThanOrEqual(1);
  });

  test('record marketing result without required fields returns 400', async () => {
    const { status } = await post('/api/outbound/results/marketing-results', {
      phone: '13900000004',
    });
    expect(status).toBe(400);
  });
});

// ── SMS Events ──────────────────────────────────────────────────────────

describe('SMS Events', () => {
  test('record SMS event', async () => {
    const { status, data } = await post('/api/outbound/results/sms-events', {
      phone: '13900000001',
      sms_type: 'payment_link',
      context: 'collection',
      status: 'sent',
    });
    expect(status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.event_id).toBeTruthy();
  });

  test('record SMS event without required fields returns 400', async () => {
    const { status } = await post('/api/outbound/results/sms-events', {
      phone: '13900000001',
    });
    expect(status).toBe(400);
  });
});

// ── Handoff Cases ───────────────────────────────────────────────────────

describe('Handoff Cases', () => {
  test('record handoff case', async () => {
    const { status, data } = await post('/api/outbound/results/handoff-cases', {
      phone: '13900000002',
      source_skill: 'outbound-collection',
      reason: 'installment_negotiation',
      queue_name: 'collections_specialist',
    });
    expect(status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.case_id).toBeTruthy();
  });

  test('record handoff without required fields returns 400', async () => {
    const { status } = await post('/api/outbound/results/handoff-cases', {
      phone: '13900000002',
    });
    expect(status).toBe(400);
  });
});

// ── Test Personas ───────────────────────────────────────────────────────

describe('Test Personas', () => {
  test('list all personas (9 seeded)', async () => {
    const { status, data } = await get('/api/outbound/test-personas');
    expect(status).toBe(200);
    expect(data.length).toBe(9);
  });

  test('filter by category=inbound returns 3', async () => {
    const { status, data } = await get('/api/outbound/test-personas?category=inbound');
    expect(status).toBe(200);
    expect(data.length).toBe(3);
    for (const p of data) {
      expect(p.category).toBe('inbound');
    }
  });

  test('filter by category=outbound_collection returns 3', async () => {
    const { data } = await get('/api/outbound/test-personas?category=outbound_collection');
    expect(data.length).toBe(3);
  });

  test('filter by category=outbound_marketing returns 3', async () => {
    const { data } = await get('/api/outbound/test-personas?category=outbound_marketing');
    expect(data.length).toBe(3);
  });

  test('inbound persona has CDP-derived name and phone', async () => {
    const { data } = await get('/api/outbound/test-personas?category=inbound');
    const u001 = data.find((p: { id: string }) => p.id === 'U001');
    expect(u001).toBeTruthy();
    expect(u001.label).toBe('张三');
    expect(u001.context.phone).toBe('13800000001');
    expect(u001.context.name).toBe('张三');
    expect(u001.context.plan).toBeTruthy();
    expect(u001.context.region).toBeTruthy();
  });

  test('collection persona has task data (overdue_amount)', async () => {
    const { data } = await get('/api/outbound/test-personas?category=outbound_collection');
    const c001 = data.find((p: { id: string }) => p.id === 'C001');
    expect(c001).toBeTruthy();
    expect(c001.context.task_type).toBe('collection');
    expect(c001.context.overdue_amount).toBe(386);
    expect(c001.context.name).toBe('张明');
  });

  test('marketing persona has task data (campaign_name)', async () => {
    const { data } = await get('/api/outbound/test-personas?category=outbound_marketing');
    const m001 = data.find((p: { id: string }) => p.id === 'M001');
    expect(m001).toBeTruthy();
    expect(m001.context.task_type).toBe('marketing');
    expect(m001.context.campaign_name).toBe('5G升级专项活动');
    expect(m001.context.name).toBe('陈伟');
  });
});
