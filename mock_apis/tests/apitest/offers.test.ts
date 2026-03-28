/**
 * API tests for: src/routes/offers.ts
 * Mount: /api/offers
 * Routes: GET eligible, GET campaigns/:campaignId
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();

async function get(path: string) {
  const res = await app.request(path);
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('GET /api/offers/eligible', () => {
  test('returns 400 when msisdn is missing', async () => {
    const { status, data } = await get('/api/offers/eligible');
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/offers/eligible?msisdn=19900000099');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('returns ineligible for DND customer (13800000002)', async () => {
    // 李四 has dnd=true in customer_preferences
    const { status, data } = await get('/api/offers/eligible?msisdn=13800000002');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.eligible).toBe(false);
    expect(data.reason).toBe('customer_in_dnd');
    expect(data.offers).toEqual([]);
  });

  test('returns ineligible for suspended/overdue customer (13800000003)', async () => {
    // 王五: status=suspended, overdue_days=25, balance=-23.5
    const { status, data } = await get('/api/offers/eligible?msisdn=13800000003');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.eligible).toBe(false);
    expect(data.reason).toBe('subscriber_not_marketable');
    expect(data.offers).toEqual([]);
  });

  test('returns eligible offers for 13800000001 (plan_50g, active)', async () => {
    // 张三: plan_50g, data_used_gb=32.5, plan data_gb=50 → usage ratio 0.65 >= 0.6
    // Should match CMP-UP-100G
    const { status, data } = await get('/api/offers/eligible?msisdn=13800000001');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(data.eligible).toBe(true);
    const offers = data.offers as Array<Record<string, unknown>>;
    expect(offers.length).toBeGreaterThanOrEqual(1);
    const campaignIds = offers.map((o) => o.campaign_id);
    expect(campaignIds).toContain('CMP-UP-100G');
  });
});

describe('GET /api/offers/campaigns/:campaignId', () => {
  test('returns campaign detail for existing campaign', async () => {
    const { status, data } = await get('/api/offers/campaigns/CMP-UP-100G');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    const campaign = data.campaign as Record<string, unknown>;
    expect(campaign.campaign_id).toBe('CMP-UP-100G');
    expect(campaign.campaign_name).toBe('畅享 50G 升级 100G');
    expect(campaign.offer_type).toBe('plan_upgrade');
    expect(campaign.status).toBe('active');
  });

  test('returns campaign detail for CMP-ROAM-001', async () => {
    const { status, data } = await get('/api/offers/campaigns/CMP-ROAM-001');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    const campaign = data.campaign as Record<string, unknown>;
    expect(campaign.campaign_id).toBe('CMP-ROAM-001');
  });

  test('returns 404 for non-existent campaign', async () => {
    const { status, data } = await get('/api/offers/campaigns/CMP-NONEXIST');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});
