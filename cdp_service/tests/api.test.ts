/**
 * CDP Service API Tests
 *
 * 测试核心 API：identity resolve, party CRUD, context, consent check, events
 * 前置条件：cdp.db 已 seed（测试前自动执行）
 */
import { describe, test, expect, beforeAll } from 'bun:test';

const BASE = `http://localhost:${process.env.CDP_SERVICE_PORT ?? 18020}`;

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

async function patch(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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
  test('GET /health returns ok with 16 modules', async () => {
    const { data } = await get('/health');
    expect(data.status).toBe('ok');
    expect(data.service).toBe('cdp-service');
    expect(data.modules.length).toBe(16);
  });
});

// ── Identity Resolve ──────────────────────────────────────────────────────

describe('Identity Resolve', () => {
  test('resolves existing phone to party', async () => {
    const { status, data } = await post('/api/cdp/identity/resolve', {
      identity_type: 'phone',
      identity_value: '13800000001',
    });
    expect(status).toBe(200);
    expect(data.resolved).toBe(true);
    expect(data.party_id).toBeTruthy();
    expect(data.display_name).toBe('张三');
  });

  test('returns resolved=false for unknown phone', async () => {
    const { status, data } = await post('/api/cdp/identity/resolve', {
      identity_type: 'phone',
      identity_value: '99999999999',
    });
    expect(status).toBe(200);
    expect(data.resolved).toBe(false);
  });

  test('normalizes phone (strips non-digits)', async () => {
    const { data } = await post('/api/cdp/identity/resolve', {
      identity_type: 'phone',
      identity_value: '138-0000-0001',
    });
    expect(data.resolved).toBe(true);
  });

  test('returns 400 without required fields', async () => {
    const { status } = await post('/api/cdp/identity/resolve', {});
    expect(status).toBe(400);
  });
});

// ── Party CRUD ────────────────────────────────────────────────────────────

describe('Party', () => {
  let partyId: string;

  test('create party with identities and contacts', async () => {
    const { status, data } = await post('/api/cdp/party', {
      party_type: 'customer',
      display_name: 'Test User',
      identities: [{ identity_type: 'email', identity_value: 'test@example.com' }],
      contact_points: [{ contact_type: 'email', contact_value: 'test@example.com' }],
    });
    expect(status).toBe(201);
    expect(data.party_id).toBeTruthy();
    partyId = data.party_id;
  });

  test('get party by id', async () => {
    const { status, data } = await get(`/api/cdp/party/${partyId}`);
    expect(status).toBe(200);
    expect(data.display_name).toBe('Test User');
    expect(data.party_type).toBe('customer');
  });

  test('get party returns 404 for missing id', async () => {
    const { status } = await get('/api/cdp/party/00000000-0000-0000-0000-000000000000');
    expect(status).toBe(404);
  });

  test('add identity to party', async () => {
    const { status, data } = await post(`/api/cdp/party/${partyId}/identity`, {
      identity_type: 'phone',
      identity_value: '19900001111',
    });
    expect(status).toBe(201);
    expect(data.party_identity_id).toBeTruthy();
  });

  test('duplicate identity returns 409', async () => {
    const { status } = await post(`/api/cdp/party/${partyId}/identity`, {
      identity_type: 'phone',
      identity_value: '19900001111',
    });
    expect(status).toBe(409);
  });
});

// ── Customer Context ──────────────────────────────────────────────────────

describe('Customer Context', () => {
  let partyId: string;

  beforeAll(async () => {
    const { data } = await post('/api/cdp/identity/resolve', {
      identity_type: 'phone',
      identity_value: '13800000001',
    });
    partyId = data.party_id;
  });

  test('returns full context with profile', async () => {
    const { status, data } = await get(`/api/cdp/party/${partyId}/context`);
    expect(status).toBe(200);
    expect(data.party).toBeTruthy();
    expect(data.identities.length).toBeGreaterThan(0);
    expect(data.contact_points.length).toBeGreaterThan(0);
    expect(data.subscriptions.length).toBeGreaterThan(0);
    expect(data.profile).toBeTruthy();
    expect(data.profile.basic_profile_json).toBeTruthy();
  });

  test('context profile contains gender', async () => {
    const { data } = await get(`/api/cdp/party/${partyId}/context`);
    const basic = JSON.parse(data.profile.basic_profile_json);
    expect(basic.gender).toBeTruthy();
  });

  test('returns subscriptions list', async () => {
    const { status, data } = await get(`/api/cdp/party/${partyId}/subscriptions`);
    expect(status).toBe(200);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items[0].plan_code).toBeTruthy();
  });
});

// ── Consent & Contactability ──────────────────────────────────────────────

describe('Consent', () => {
  let partyId: string;

  beforeAll(async () => {
    const { data } = await post('/api/cdp/identity/resolve', {
      identity_type: 'phone',
      identity_value: '13800000001',
    });
    partyId = data.party_id;
  });

  test('check contactability returns result', async () => {
    const { status, data } = await get(
      `/api/cdp/consents/check?party_id=${partyId}&channel_type=phone&purpose_type=service`,
    );
    expect(status).toBe(200);
    expect(typeof data.contactable).toBe('boolean');
    expect(data.party_id).toBe(partyId);
  });

  test('create and revoke consent', async () => {
    const { data: created } = await post('/api/cdp/consents', {
      party_id: partyId,
      channel_type: 'email',
      purpose_type: 'marketing',
      consent_status: 'granted',
    });
    expect(created.consent_record_id).toBeTruthy();

    const { data: revoked } = await patch(`/api/cdp/consents/${created.consent_record_id}`, {
      consent_status: 'revoked',
    });
    expect(revoked.consent_status).toBe('revoked');
  });
});

// ── Customer Events ───────────────────────────────────────────────────────

describe('Customer Events', () => {
  let partyId: string;

  beforeAll(async () => {
    const { data } = await post('/api/cdp/identity/resolve', {
      identity_type: 'phone',
      identity_value: '13800000001',
    });
    partyId = data.party_id;
  });

  test('create event and query timeline', async () => {
    const { status, data } = await post('/api/cdp/events', {
      party_id: partyId,
      event_type: 'login',
      event_category: 'identity',
      source_system: 'test',
    });
    expect(status).toBe(201);
    expect(data.customer_event_id).toBeTruthy();

    const { data: timeline } = await get(`/api/cdp/events?party_id=${partyId}&limit=5`);
    expect(timeline.items.length).toBeGreaterThan(0);
  });
});

// ── Source Records ────────────────────────────────────────────────────────

describe('Source Records', () => {
  test('query by source returns lineage for seeded subscriber', async () => {
    const { status, data } = await get(
      '/api/cdp/source-records/by-source?source_system=business_db&source_entity_type=subscriber&source_entity_id=13800000001',
    );
    expect(status).toBe(200);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items[0].target_entity_type).toBe('party');
  });
});

// ── Views (Profile / Service Summary) ─────────────────────────────────────

describe('Views', () => {
  let partyId: string;

  beforeAll(async () => {
    const { data } = await post('/api/cdp/identity/resolve', {
      identity_type: 'phone',
      identity_value: '13800000001',
    });
    partyId = data.party_id;
  });

  test('get service summary', async () => {
    const { status, data } = await get(`/api/cdp/views/service-summary?party_id=${partyId}`);
    expect(status).toBe(200);
    expect(data.active_subscription_count).toBeGreaterThan(0);
    expect(data.service_status).toBe('normal');
  });

  test('upsert interaction summary', async () => {
    const { status, data } = await put('/api/cdp/views/interaction-summary', {
      party_id: partyId,
      contact_count_7d: 3,
      last_channel: 'phone',
    });
    expect([200, 201]).toContain(status);
    expect(data.interaction_summary_id).toBeTruthy();

    // update
    const { data: updated } = await put('/api/cdp/views/interaction-summary', {
      party_id: partyId,
      contact_count_7d: 5,
    });
    expect(updated.action).toBe('updated');
  });
});
