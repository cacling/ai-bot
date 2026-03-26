/**
 * API tests for: src/services/user_info_service.ts (Port: 18003)
 * Tools: query_subscriber, query_bill, query_plans, analyze_bill_anomaly
 * Mock: backendGet/backendPost (mock_apis HTTP calls)
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool } from './helpers';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

// ── Mock data ────────────────────────────────────────────────────────────────

const ACTIVE_SUBSCRIBER = {
  success: true,
  subscriber: {
    msisdn: '13800000001',
    name: '张三',
    gender: 'male',
    status: 'active',
    balance: 38.5,
    overdue_days: 0,
    data_used_gb: 30,
    voice_used_min: 150,
    plan: {
      plan_id: 'plan_50g',
      name: '畅享50G套餐',
      plan_type: 'data',
      monthly_fee: 99,
      data_gb: 50,
      voice_min: 300,
    },
  },
};

const ACTIVE_SERVICES = {
  success: true,
  services: [
    { service_id: 'video_pkg', name: '视频会员包', monthly_fee: 15, subscribed_at: '2025-06-01', auto_renew: true },
    { service_id: 'sms_100', name: '100条短信包', monthly_fee: 5, subscribed_at: '2025-08-01', auto_renew: false },
  ],
};

const SUSPENDED_SUBSCRIBER = {
  success: true,
  subscriber: {
    msisdn: '13800000002',
    name: '李四',
    gender: 'female',
    status: 'suspended',
    balance: -50,
    overdue_days: 45,
    data_used_gb: 0,
    voice_used_min: 0,
    plan: {
      plan_id: 'plan_20g',
      name: '基础20G套餐',
      plan_type: 'data',
      monthly_fee: 59,
      data_gb: 20,
      voice_min: 100,
    },
  },
};

const RECYCLED_SUBSCRIBER = {
  success: true,
  subscriber: {
    msisdn: '13800000005',
    name: '赵六',
    status: 'suspended',
    balance: -200,
    overdue_days: 200,
    data_used_gb: 0,
    voice_used_min: 0,
    plan: { plan_id: 'plan_20g', name: '基础20G', monthly_fee: 59, data_gb: 20, voice_min: 100 },
  },
};

const CANCELLED_SUBSCRIBER = {
  success: true,
  subscriber: {
    msisdn: '13800000006',
    name: '钱七',
    status: 'cancelled',
    balance: -10,
    overdue_days: 30,
    data_used_gb: 0,
    voice_used_min: 0,
    plan: { plan_id: 'plan_20g', name: '基础20G', monthly_fee: 59, data_gb: 20, voice_min: 100 },
  },
};

const PRE_CANCEL_SUBSCRIBER = {
  success: true,
  subscriber: {
    msisdn: '13800000007',
    name: '孙八',
    status: 'suspended',
    balance: -80,
    overdue_days: 120,
    data_used_gb: 0,
    voice_used_min: 0,
    plan: { plan_id: 'plan_20g', name: '基础20G', monthly_fee: 59, data_gb: 20, voice_min: 100 },
  },
};

const BILL_202602 = {
  success: true,
  bill: {
    month: '2026-02',
    total: 120,
    plan_fee: 99,
    data_fee: 10,
    voice_fee: 5,
    value_added_fee: 6,
    tax: 0,
    status: 'paid',
  },
};

const BILLS_RECENT = {
  success: true,
  bills: [
    { month: '2026-02', total: 120, plan_fee: 99, data_fee: 10, voice_fee: 5, value_added_fee: 6, tax: 0, status: 'paid' },
    { month: '2026-01', total: 110, plan_fee: 99, data_fee: 5, voice_fee: 3, value_added_fee: 3, tax: 0, status: 'paid' },
    { month: '2025-12', total: 105, plan_fee: 99, data_fee: 2, voice_fee: 2, value_added_fee: 2, tax: 0, status: 'paid' },
  ],
};

const ALL_PLANS = {
  success: true,
  plans: [
    { plan_id: 'plan_50g', name: '畅享50G套餐', monthly_fee: 99, data_gb: 50, voice_min: 300 },
    { plan_id: 'plan_20g', name: '基础20G套餐', monthly_fee: 59, data_gb: 20, voice_min: 100 },
    { plan_id: 'plan_100g', name: '尊享100G套餐', monthly_fee: 169, data_gb: 100, voice_min: 500 },
  ],
};

const SINGLE_PLAN = {
  success: true,
  plan: { plan_id: 'plan_50g', name: '畅享50G套餐', monthly_fee: 99, data_gb: 50, voice_min: 300 },
};

const ANOMALY_RESULT = {
  success: true,
  current_total: 180,
  previous_total: 120,
  previous_month: '2026-01',
  diff: 60,
  change_ratio: 0.5,
  primary_cause: 'data_fee',
  causes: [
    { item: '流量费', current: 70, previous: 10, diff: 60 },
  ],
  item_details: [],
  summary: '流量费大幅增加',
  changed_items_text: ['流量费从10元增至70元'],
};

const NO_ANOMALY_RESULT = {
  success: true,
  current_total: 102,
  previous_total: 100,
  previous_month: '2026-01',
  diff: 2,
  change_ratio: 0.02,
  primary_cause: 'unknown',
  causes: [],
};

// ── Setup ────────────────────────────────────────────────────────────────────

let client: Client;

beforeAll(async () => {
  mockBackend({
    get: (path: string) => {
      // Subscriber endpoints
      if (path === '/api/customer/subscribers/13800000001') return ACTIVE_SUBSCRIBER;
      if (path === '/api/customer/subscribers/13800000001/services') return ACTIVE_SERVICES;
      if (path === '/api/customer/subscribers/13800000002') return SUSPENDED_SUBSCRIBER;
      if (path === '/api/customer/subscribers/13800000002/services') return { success: true, services: [] };
      if (path === '/api/customer/subscribers/13800000005') return RECYCLED_SUBSCRIBER;
      if (path === '/api/customer/subscribers/13800000005/services') return { success: true, services: [] };
      if (path === '/api/customer/subscribers/13800000006') return CANCELLED_SUBSCRIBER;
      if (path === '/api/customer/subscribers/13800000006/services') return { success: true, services: [] };
      if (path === '/api/customer/subscribers/13800000007') return PRE_CANCEL_SUBSCRIBER;
      if (path === '/api/customer/subscribers/13800000007/services') return { success: true, services: [] };
      if (path === '/api/customer/subscribers/13899999999') return { success: false };
      if (path === '/api/customer/subscribers/13899999999/services') return { success: true, services: [] };

      // Bill endpoints
      if (path === '/api/billing/accounts/13800000001/bills/2026-02') return BILL_202602;
      if (path === '/api/billing/accounts/13800000001/bills?limit=3') return BILLS_RECENT;
      if (path === '/api/billing/accounts/13800000001/bills/2025-06') return { success: false };
      if (path === '/api/billing/accounts/13899999999/bills?limit=3') return { success: false };

      // Plans endpoints
      if (path === '/api/catalog/plans') return ALL_PLANS;
      if (path === '/api/catalog/plans/plan_50g') return SINGLE_PLAN;
      if (path === '/api/catalog/plans/plan_nonexist') return { success: false };

      return { success: false, message: `Unmocked GET: ${path}` };
    },
    post: (path: string, body: unknown) => {
      if (path === '/api/billing/anomaly/analyze') {
        const b = body as { msisdn: string; month: string };
        if (b.msisdn === '13800000001' && b.month === '2026-02') return ANOMALY_RESULT;
        if (b.msisdn === '13800000001' && b.month === '2026-01') return NO_ANOMALY_RESULT;
        return { success: false, message: '账单未找到' };
      }
      return { success: false, message: `Unmocked POST: ${path}` };
    },
  });

  const createServer = await loadService('src/services/user_info_service.ts');
  client = await createTestClient(createServer);
});

// ── query_subscriber ─────────────────────────────────────────────────────────

describe('query_subscriber', () => {
  test('returns subscriber info with plan, balance, status for active user', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13800000001' });
    expect(res.phone).toBe('13800000001');
    expect(res.name).toBe('张三');
    expect(res.status).toBe('active');
    expect(res.balance).toBe(38.5);
    expect(res.plan_name).toBe('畅享50G套餐');
    expect(res.plan_fee).toBe(99);
  });

  test('returns services list with vas_total_fee', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13800000001' });
    const services = res.services as any[];
    expect(services.length).toBe(2);
    expect(services[0].service_id).toBe('video_pkg');
    expect(services[0].monthly_fee).toBe(15);
    expect(services[1].service_id).toBe('sms_100');
    expect(res.vas_total_fee).toBe(20); // 15 + 5
  });

  test('calculates data_usage_ratio and voice_usage_ratio', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13800000001' });
    // data: 30/50 = 0.6
    expect(res.data_usage_ratio).toBe(0.6);
    // voice: 150/300 = 0.5
    expect(res.voice_usage_ratio).toBe(0.5);
  });

  test('calculates arrears_level=none when balance >= 0', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13800000001' });
    expect(res.arrears_level).toBe('none');
    expect(res.is_arrears).toBe(false);
    expect(res.overdue_days).toBe(0);
  });

  test('calculates arrears_level=normal when overdue_days <= 90', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13800000002' });
    expect(res.arrears_level).toBe('normal');
    expect(res.is_arrears).toBe(true);
    expect(res.overdue_days).toBe(45);
    expect(res.balance).toBe(-50);
  });

  test('calculates arrears_level=pre_cancel when 90 < overdue_days <= 180', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13800000007' });
    expect(res.arrears_level).toBe('pre_cancel');
    expect(res.overdue_days).toBe(120);
  });

  test('calculates arrears_level=recycled when overdue_days > 180', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13800000005' });
    expect(res.arrears_level).toBe('recycled');
    expect(res.overdue_days).toBe(200);
  });

  test('calculates arrears_level=recycled when status is cancelled regardless of overdue_days', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13800000006' });
    expect(res.arrears_level).toBe('recycled');
    // overdue_days is only 30, but cancelled status forces recycled
    expect(res.overdue_days).toBe(30);
  });

  test('returns null name and 0 balance for non-existent phone', async () => {
    const res = await callTool(client, 'query_subscriber', { phone: '13899999999' });
    expect(res.phone).toBe('13899999999');
    expect(res.name).toBeNull();
    expect(res.balance).toBe(0);
    expect(res.services).toEqual([]);
    expect(res.vas_total_fee).toBe(0);
  });
});

// ── query_bill ───────────────────────────────────────────────────────────────

describe('query_bill', () => {
  test('returns specific month bill with breakdown for YYYY-MM format', async () => {
    const res = await callTool(client, 'query_bill', { phone: '13800000001', month: '2026-02' });
    expect(res.count).toBe(1);
    expect(res.requested_month).toBe('2026-02');
    const bills = res.bills as any[];
    expect(bills.length).toBe(1);
    expect(bills[0].month).toBe('2026-02');
    expect(bills[0].month_label).toBe('2026年2月');
    expect(bills[0].total).toBe(120);
  });

  test('returns fee breakdown with item, amount, ratio', async () => {
    const res = await callTool(client, 'query_bill', { phone: '13800000001', month: '2026-02' });
    const bill = (res.bills as any[])[0];
    const breakdown = bill.breakdown as any[];
    expect(breakdown.length).toBeGreaterThan(0);

    const planItem = breakdown.find((b: any) => b.item === '套餐月费');
    expect(planItem).toBeDefined();
    expect(planItem.amount).toBe(99);
    // ratio = 99/120 = 0.825 -> rounded to 0.83
    expect(planItem.ratio).toBe(0.83);

    const dataItem = breakdown.find((b: any) => b.item === '流量费');
    expect(dataItem).toBeDefined();
    expect(dataItem.amount).toBe(10);
  });

  test('filters out zero-amount items from breakdown', async () => {
    const res = await callTool(client, 'query_bill', { phone: '13800000001', month: '2026-02' });
    const bill = (res.bills as any[])[0];
    const breakdown = bill.breakdown as any[];
    // tax is 0, should be filtered out
    const taxItem = breakdown.find((b: any) => b.item === '税费');
    expect(taxItem).toBeUndefined();
  });

  test('sets payable=false for paid bills', async () => {
    const res = await callTool(client, 'query_bill', { phone: '13800000001', month: '2026-02' });
    const bill = (res.bills as any[])[0];
    expect(bill.payable).toBe(false);
  });

  test('returns last 3 months when month is omitted', async () => {
    const res = await callTool(client, 'query_bill', { phone: '13800000001' });
    expect(res.count).toBe(3);
    expect(res.requested_month).toBeNull();
    const bills = res.bills as any[];
    expect(bills.length).toBe(3);
    expect(bills[0].month).toBe('2026-02');
    expect(bills[2].month).toBe('2025-12');
    // Each bill should have breakdown
    for (const bill of bills) {
      expect(bill.breakdown).toBeDefined();
      expect(bill.month_label).toBeDefined();
    }
  });

  test('returns empty bills with note for non-existent month', async () => {
    const res = await callTool(client, 'query_bill', { phone: '13800000001', month: '2025-06' });
    expect(res.count).toBe(0);
    expect(res.bills).toEqual([]);
    expect((res.note as string)).toContain('2025-06');
  });

  test('returns empty bills for non-existent phone', async () => {
    const res = await callTool(client, 'query_bill', { phone: '13899999999' });
    expect(res.count).toBe(0);
    expect(res.bills).toEqual([]);
  });
});

// ── query_plans ──────────────────────────────────────────────────────────────

describe('query_plans', () => {
  test('returns all plans when plan_id is omitted', async () => {
    const res = await callTool(client, 'query_plans', {});
    expect(res.count).toBe(3);
    expect(res.requested_plan_id).toBeNull();
    const plans = res.plans as any[];
    expect(plans.length).toBe(3);
    expect(plans.map((p: any) => p.plan_id)).toContain('plan_50g');
  });

  test('returns single plan when plan_id is provided', async () => {
    const res = await callTool(client, 'query_plans', { plan_id: 'plan_50g' });
    expect(res.count).toBe(1);
    expect(res.requested_plan_id).toBe('plan_50g');
    const plans = res.plans as any[];
    expect(plans[0].name).toBe('畅享50G套餐');
    expect(plans[0].monthly_fee).toBe(99);
  });

  test('returns empty for non-existent plan_id', async () => {
    const res = await callTool(client, 'query_plans', { plan_id: 'plan_nonexist' });
    expect(res.count).toBe(0);
    expect(res.plans).toEqual([]);
    expect(res.requested_plan_id).toBe('plan_nonexist');
  });
});

// ── analyze_bill_anomaly ─────────────────────────────────────────────────────

describe('analyze_bill_anomaly', () => {
  test('detects anomaly when change_ratio > 0.2 (is_anomaly=true)', async () => {
    const res = await callTool(client, 'analyze_bill_anomaly', { phone: '13800000001', month: '2026-02' });
    expect(res.is_anomaly).toBe(true);
    expect(res.current_month).toBe('2026-02');
    expect(res.previous_month).toBe('2026-01');
    expect(res.current_total).toBe(180);
    expect(res.previous_total).toBe(120);
    expect(res.diff).toBe(60);
    // change_ratio 0.5 -> 50%
    expect(res.change_ratio).toBe(50);
    expect(res.primary_cause).toBe('data_fee');
    expect((res.causes as any[]).length).toBe(1);
    expect((res.recommendation as string)).toContain('流量');
  });

  test('returns is_anomaly=false when change_ratio <= 0.2', async () => {
    const res = await callTool(client, 'analyze_bill_anomaly', { phone: '13800000001', month: '2026-01' });
    expect(res.is_anomaly).toBe(false);
    expect(res.current_total).toBe(102);
    expect(res.previous_total).toBe(100);
    expect(res.diff).toBe(2);
    // change_ratio 0.02 -> 2%
    expect(res.change_ratio).toBe(2);
  });

  test('returns graceful fallback when bill not found', async () => {
    const res = await callTool(client, 'analyze_bill_anomaly', { phone: '13899999999', month: '2026-02' });
    expect(res.is_anomaly).toBe(false);
    expect(res.current_total).toBe(0);
    expect(res.previous_total).toBe(0);
    expect(res.primary_cause).toBe('unknown');
    expect((res.recommendation as string)).toContain('账单未找到');
  });

  test('provides correct recommendation for data_fee cause', async () => {
    const res = await callTool(client, 'analyze_bill_anomaly', { phone: '13800000001', month: '2026-02' });
    expect((res.recommendation as string)).toContain('流量');
    expect((res.recommendation as string)).toContain('套餐');
  });
});
