/**
 * API tests for: src/routes/network.ts
 * Mount: /api/network
 * Routes: GET incidents, GET subscribers/:msisdn/diagnostics
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();

async function get(path: string) {
  const res = await app.request(path);
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('GET /api/network/incidents', () => {
  test('returns all incidents when no filters', async () => {
    const { status, data } = await get('/api/network/incidents');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(5);
    expect(Array.isArray(data.incidents)).toBe(true);
  });

  test('filters by region', async () => {
    const { status, data } = await get('/api/network/incidents?region=深圳');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    const incidents = data.incidents as Array<Record<string, unknown>>;
    // Should include 深圳 regional + 全国 incidents
    for (const inc of incidents) {
      expect(inc.region === '深圳' || inc.region === '全国').toBe(true);
    }
  });

  test('filters by status', async () => {
    const { status, data } = await get('/api/network/incidents?status=open');
    expect(status).toBe(200);
    const incidents = data.incidents as Array<Record<string, unknown>>;
    expect(incidents.length).toBeGreaterThanOrEqual(2); // NET-001, NET-003
    for (const inc of incidents) {
      expect(inc.status).toBe('open');
    }
  });

  test('filters by both region and status', async () => {
    const { status, data } = await get('/api/network/incidents?region=广州&status=open');
    expect(status).toBe(200);
    const incidents = data.incidents as Array<Record<string, unknown>>;
    // NET-001 (广州, open) + NET-004 (全国, observing) is excluded by status
    for (const inc of incidents) {
      expect(inc.status).toBe('open');
      expect(inc.region === '广州' || inc.region === '全国').toBe(true);
    }
  });

  test('returns empty when no match', async () => {
    const { status, data } = await get('/api/network/incidents?region=成都&status=open');
    expect(status).toBe(200);
    // Only 全国 open incidents would match (if any). NET-004 is observing not open.
    const incidents = data.incidents as Array<Record<string, unknown>>;
    for (const inc of incidents) {
      expect(inc.region).toBe('全国');
      expect(inc.status).toBe('open');
    }
  });

  test('affected_services is parsed as array', async () => {
    const { data } = await get('/api/network/incidents');
    const incidents = data.incidents as Array<Record<string, unknown>>;
    for (const inc of incidents) {
      expect(Array.isArray(inc.affected_services)).toBe(true);
    }
  });
});

describe('GET /api/network/subscribers/:msisdn/diagnostics', () => {
  test('returns diagnostics for active subscriber (13800000001, 广州)', async () => {
    const { status, data } = await get('/api/network/subscribers/13800000001/diagnostics');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(data.region).toBe('广州');
    // NET-001 (广州, open) + NET-004 (全国) match 广州 region
    expect(typeof data.network_status).toBe('string');
    expect(['degraded', 'normal']).toContain(data.network_status);
    expect(Array.isArray(data.open_incidents)).toBe(true);
    expect(typeof data.recommended_action).toBe('string');
  });

  test('network_status is degraded when open incidents exist', async () => {
    // 13800000001 is in 广州, NET-001 is open in 广州
    const { data } = await get('/api/network/subscribers/13800000001/diagnostics');
    expect(data.network_status).toBe('degraded');
  });

  test('returns diagnostics for 北京 subscriber (13800000003)', async () => {
    const { data } = await get('/api/network/subscribers/13800000003/diagnostics');
    expect(data.success).toBe(true);
    expect(data.region).toBe('北京');
    // NET-003 is 北京 open outage
    expect(data.network_status).toBe('degraded');
  });

  test('filters by issue_type=slow_data (maps to congestion)', async () => {
    const { data } = await get('/api/network/subscribers/13800000001/diagnostics?issue_type=slow_data');
    expect(data.success).toBe(true);
    expect(data.issue_type).toBe('slow_data');
    const incidents = data.open_incidents as Array<Record<string, unknown>>;
    for (const inc of incidents) {
      expect(inc.incident_type).toBe('congestion');
    }
  });

  test('filters by issue_type=no_network (maps to outage)', async () => {
    const { data } = await get('/api/network/subscribers/13800000003/diagnostics?issue_type=no_network');
    expect(data.success).toBe(true);
    const incidents = data.open_incidents as Array<Record<string, unknown>>;
    for (const inc of incidents) {
      expect(inc.incident_type).toBe('outage');
    }
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/network/subscribers/19900000099/diagnostics');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});
