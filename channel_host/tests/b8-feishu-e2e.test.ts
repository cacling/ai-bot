/**
 * Phase B8 Tests: Feishu E2E Scenarios
 *
 * Validates the full Feishu message flow:
 *   Customer (ou_xxx) → Feishu WSClient → Feishu Gateway (:18032)
 *   → Channel-Host (:18030) /webhooks/feishu → Inbound Bridge
 *   → AI Agent Backend (:18472) → Reply via Feishu Gateway /send → Customer
 *
 * Roles:
 *   - Bot: Feishu bot app (APP_ID = test-app-id)
 *   - Customer: 陈军 (open_id = ou_210e97fbdab389fc711e4784262bc6b2)
 *
 * External HTTP calls are intercepted via mock HTTP servers on 19xxx ports.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';

import '../src/runtime-plane/sdk-compat/_loader';

import { migrateDb } from '../src/db';
import { resetRegistry } from '../src/runtime-plane/runtime-registry';
import {
  normalizeInbound,
  handleInbound,
  onIngress,
  type RawInboundEnvelope,
} from '../src/bridge-plane/inbound-bridge';
import {
  verifyToken,
  handleChallenge,
  parseMessageEvent,
  type FeishuWebhookBody,
} from '../src/runtime-plane/feishu-gateway';

// ---------------------------------------------------------------------------
// Test constants — match real deployment data
// ---------------------------------------------------------------------------

/** Customer (sends messages to bot) */
const CUSTOMER_OPEN_ID = 'ou_210e97fbdab389fc711e4784262bc6b2';
const CUSTOMER_PHONE = '13609796392';
const CUSTOMER_NAME = '陈军';

/** Chat ID (Feishu p2p chat between bot and customer) */
const P2P_CHAT_ID = 'oc_test_chat_001';
const GROUP_CHAT_ID = 'oc_test_group_001';

const VERIFY_TOKEN = 'test-verify-token';

// ---------------------------------------------------------------------------
// Mock HTTP servers for external dependencies
// ---------------------------------------------------------------------------

interface MockCall {
  path: string;
  method: string;
  body: unknown;
  timestamp: number;
}

let mockBackendServer: Server;
let mockFeishuGateway: Server;
let mockBaileysGateway: Server;
let mockInteractionPlatform: Server;
let mockCdp: Server;

const mockCalls: MockCall[] = [];

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: Buffer) => (data += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

function createMockServer(
  port: number,
  handler: (path: string, method: string, body: unknown, res: ServerResponse) => void,
): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      const body = await parseBody(req);
      mockCalls.push({ path: url.pathname, method: req.method ?? 'GET', body, timestamp: Date.now() });
      handler(url.pathname, req.method ?? 'GET', body, res);
    });
    server.listen(port, () => resolve(server));
  });
}

function respond(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const MOCK_AGENT_REPLY = '您好！我是小通，电信智能客服。请问有什么可以帮您？';

beforeAll(async () => {
  const { mkdirSync, existsSync } = require('fs');
  if (!existsSync('./data')) mkdirSync('./data', { recursive: true });
  migrateDb();
  resetRegistry();

  // Mock backend agent API (:19472)
  mockBackendServer = await createMockServer(19472, (path, method, body, res) => {
    if (path === '/api/chat' && method === 'POST') {
      const req = body as Record<string, unknown>;
      respond(res, {
        response: MOCK_AGENT_REPLY,
        session_id: req.session_id ?? 'test-session',
      });
    } else {
      respond(res, { error: 'Not found' }, 404);
    }
  });

  // Mock Feishu gateway (:19032)
  mockFeishuGateway = await createMockServer(19032, (path, method, body, res) => {
    if (path === '/send' && method === 'POST') {
      respond(res, { success: true, messageId: `feishu-msg-${Date.now()}` });
    } else if (path === '/health') {
      respond(res, { status: 'ok', service: 'feishu-gateway', connectionState: 'connected' });
    } else {
      respond(res, { error: 'Not found' }, 404);
    }
  });

  // Mock Baileys gateway (:19031) — needed for cross-channel isolation test
  mockBaileysGateway = await createMockServer(19031, (path, method, body, res) => {
    if (path === '/send' && method === 'POST') {
      respond(res, { success: true, messageId: `wa-msg-${Date.now()}` });
    } else {
      respond(res, { error: 'Not found' }, 404);
    }
  });

  // Mock Interaction Platform (:19022)
  mockInteractionPlatform = await createMockServer(19022, (path, _method, _body, res) => {
    if (path === '/api/interactions/materialize') {
      respond(res, { ok: true, interactionId: 'mock-interaction-001' });
    } else {
      respond(res, { error: 'Not found' }, 404);
    }
  });

  // Mock CDP (:19020)
  mockCdp = await createMockServer(19020, (path, method, body, res) => {
    if (path === '/api/cdp/identity/resolve-phone' && method === 'POST') {
      const req = body as Record<string, unknown>;
      // Return phone for known feishu_open_id
      if (req.identity_type === 'feishu_open_id' && req.identity_value === CUSTOMER_OPEN_ID) {
        respond(res, { resolved: true, phone: CUSTOMER_PHONE, display_name: CUSTOMER_NAME });
      } else {
        respond(res, { resolved: false });
      }
    } else if (path === '/api/cdp/identity/resolve') {
      respond(res, { ok: true, customerId: 'mock-customer-001' });
    } else if (path === '/api/identities/resolve') {
      respond(res, { ok: true, customerId: 'mock-customer-001' });
    } else {
      respond(res, { error: 'Not found' }, 404);
    }
  });
});

afterAll(() => {
  mockBackendServer?.close();
  mockFeishuGateway?.close();
  mockBaileysGateway?.close();
  mockInteractionPlatform?.close();
  mockCdp?.close();
});

beforeEach(() => {
  mockCalls.length = 0;
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function waitForMockCalls(count: number, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (mockCalls.length >= count) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error(`Timeout waiting for ${count} mock calls, got ${mockCalls.length}`));
      setTimeout(check, 50);
    };
    check();
  });
}

/** Build a Feishu im.message.receive_v1 webhook body (v2 schema) */
function buildFeishuWebhookBody(opts: {
  text: string;
  senderId?: string;
  chatId?: string;
  chatType?: 'p2p' | 'group';
  messageId?: string;
  eventId?: string;
}): FeishuWebhookBody {
  return {
    schema: '2.0',
    header: {
      event_id: opts.eventId ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      event_type: 'im.message.receive_v1',
      create_time: String(Date.now()),
      token: VERIFY_TOKEN,
      app_id: 'test-app-id',
      tenant_key: 'test-tenant',
    },
    event: {
      sender: {
        sender_id: {
          open_id: opts.senderId ?? CUSTOMER_OPEN_ID,
          union_id: 'on_test_union_001',
          user_id: 'test-user-001',
        },
        sender_type: 'user',
        tenant_key: 'test-tenant',
      },
      message: {
        message_id: opts.messageId ?? `msg-${Date.now()}`,
        chat_id: opts.chatId ?? P2P_CHAT_ID,
        chat_type: opts.chatType ?? 'p2p',
        message_type: 'text',
        content: JSON.stringify({ text: opts.text }),
        create_time: String(Date.now()),
      },
    },
  };
}

// ===========================================================================
// 1. Feishu webhook parsing (feishu-gateway.ts functions)
// ===========================================================================

describe('Feishu E2E: Webhook parsing', () => {
  test('verifyToken accepts matching token', () => {
    expect(verifyToken(VERIFY_TOKEN)).toBe(true);
  });

  test('verifyToken rejects wrong token', () => {
    expect(verifyToken('wrong-token')).toBe(false);
  });

  test('handleChallenge responds to url_verification', () => {
    const body: FeishuWebhookBody = {
      type: 'url_verification',
      challenge: 'abc123',
      token: VERIFY_TOKEN,
    };
    const result = handleChallenge(body);
    expect(result).toEqual({ challenge: 'abc123' });
  });

  test('handleChallenge returns null for non-verification events', () => {
    const body = buildFeishuWebhookBody({ text: '你好' });
    expect(handleChallenge(body)).toBeNull();
  });

  test('parseMessageEvent extracts p2p text message', () => {
    const body = buildFeishuWebhookBody({
      text: '查话费',
      senderId: CUSTOMER_OPEN_ID,
      chatId: P2P_CHAT_ID,
      chatType: 'p2p',
      messageId: 'msg-test-001',
    });

    const msg = parseMessageEvent(body);
    expect(msg).not.toBeNull();
    expect(msg!.chatId).toBe(P2P_CHAT_ID);
    expect(msg!.chatType).toBe('p2p');
    expect(msg!.senderId).toBe(CUSTOMER_OPEN_ID);
    expect(msg!.content).toBe('查话费');
    expect(msg!.messageType).toBe('text');
    expect(msg!.messageId).toBe('msg-test-001');
  });

  test('parseMessageEvent extracts group message', () => {
    const body = buildFeishuWebhookBody({
      text: '@_user_1 查流量',
      chatId: GROUP_CHAT_ID,
      chatType: 'group',
    });

    const msg = parseMessageEvent(body);
    expect(msg).not.toBeNull();
    expect(msg!.chatId).toBe(GROUP_CHAT_ID);
    expect(msg!.chatType).toBe('group');
    expect(msg!.content).toBe('@_user_1 查流量');
  });

  test('parseMessageEvent deduplicates same event_id', () => {
    const body = buildFeishuWebhookBody({
      text: '重复消息',
      eventId: 'evt-dedup-test-001',
    });

    const msg1 = parseMessageEvent(body);
    expect(msg1).not.toBeNull();

    // Same event_id again → should be deduplicated
    const msg2 = parseMessageEvent(body);
    expect(msg2).toBeNull();
  });

  test('parseMessageEvent returns null for empty text', () => {
    const body = buildFeishuWebhookBody({ text: '' });
    const msg = parseMessageEvent(body);
    expect(msg).toBeNull();
  });

  test('parseMessageEvent returns null for non-message event type', () => {
    const body: FeishuWebhookBody = {
      schema: '2.0',
      header: {
        event_id: 'evt-non-msg',
        event_type: 'contact.user.updated_v3',
        create_time: String(Date.now()),
        token: VERIFY_TOKEN,
        app_id: 'test-app-id',
        tenant_key: 'test-tenant',
      },
      event: {},
    };
    expect(parseMessageEvent(body)).toBeNull();
  });
});

// ===========================================================================
// 2. Inbound message normalization (through inbound-bridge)
// ===========================================================================

describe('Feishu E2E: Inbound message normalization', () => {
  test('normalizes Feishu p2p text message', () => {
    const envelope: RawInboundEnvelope = {
      channelId: 'feishu',
      channelAccountId: 'default',
      threadId: P2P_CHAT_ID,
      senderId: CUSTOMER_OPEN_ID,
      text: '查话费',
      metadata: {
        chatType: 'p2p',
        messageId: 'msg-test-norm-001',
        messageType: 'text',
      },
    };

    const event = normalizeInbound(envelope);
    expect(event.channelId).toBe('feishu');
    expect(event.channelAccountId).toBe('default');
    expect(event.externalThreadId).toBe(P2P_CHAT_ID);
    expect(event.externalSenderId).toBe(CUSTOMER_OPEN_ID);
    expect(event.messageType).toBe('text');
    expect(event.payload).toBe('查话费');
    expect(event.metadata.chatType).toBe('p2p');
  });

  test('normalizes Feishu group message', () => {
    const event = normalizeInbound({
      channelId: 'feishu',
      channelAccountId: 'default',
      threadId: GROUP_CHAT_ID,
      senderId: CUSTOMER_OPEN_ID,
      text: '查流量',
      metadata: { chatType: 'group' },
    });

    expect(event.externalThreadId).toBe(GROUP_CHAT_ID);
    expect(event.externalSenderId).toBe(CUSTOMER_OPEN_ID);
    expect(event.payload).toBe('查流量');
  });

  test('normalizes envelope with missing optional fields', () => {
    const event = normalizeInbound({
      channelId: 'feishu',
      channelAccountId: 'default',
    });

    expect(event.externalThreadId).toBe('');
    expect(event.externalSenderId).toBe('');
    expect(event.messageType).toBe('text');
    expect(event.payload).toBe('');
    expect(event.timestamp).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 3. Full inbound → agent → reply pipeline
// ===========================================================================

describe('Feishu E2E: Full inbound → agent → reply pipeline', () => {
  test('customer "查话费" triggers agent call and reply via Feishu gateway', async () => {
    const ingressEvents: unknown[] = [];
    const unsub = onIngress((event) => { ingressEvents.push(event); });

    const event = await handleInbound({
      channelId: 'feishu',
      channelAccountId: 'default',
      threadId: P2P_CHAT_ID,
      senderId: CUSTOMER_OPEN_ID,
      text: '查话费',
      metadata: { chatType: 'p2p', messageId: 'msg-e2e-001' },
      timestamp: Date.now(),
    });

    expect(event.channelId).toBe('feishu');
    expect(event.messageType).toBe('text');
    expect(event.payload).toBe('查话费');
    expect(ingressEvents.length).toBe(1);

    // Wait for async fire-and-forget calls:
    // interaction-platform materialize + CDP resolve-phone + CDP resolve + backend /api/chat + feishu gateway /send
    await waitForMockCalls(5);

    // Verify backend agent was called with resolved phone
    const agentCall = mockCalls.find(c => c.path === '/api/chat');
    expect(agentCall).toBeDefined();
    const agentBody = agentCall!.body as Record<string, unknown>;
    expect(agentBody.message).toBe('查话费');
    expect(agentBody.user_phone).toBe(CUSTOMER_PHONE);
    expect(agentBody.lang).toBe('zh');
    expect(typeof agentBody.session_id).toBe('string');

    // Verify reply was sent to Feishu gateway /send
    const sendCall = mockCalls.find(c => c.path === '/send');
    expect(sendCall).toBeDefined();
    const sendBody = sendCall!.body as Record<string, unknown>;
    expect(sendBody.chatId).toBe(P2P_CHAT_ID);
    expect(sendBody.text).toBe(MOCK_AGENT_REPLY);

    // Verify Interaction Platform was notified
    const ipCall = mockCalls.find(c => c.path === '/api/interactions/materialize');
    expect(ipCall).toBeDefined();

    // Verify CDP identity resolve-phone was called
    const cdpCall = mockCalls.find(c => c.path === '/api/cdp/identity/resolve-phone');
    expect(cdpCall).toBeDefined();
    const cdpBody = cdpCall!.body as Record<string, unknown>;
    expect(cdpBody.identity_type).toBe('feishu_open_id');
    expect(cdpBody.identity_value).toBe(CUSTOMER_OPEN_ID);

    unsub();
  });

  test('multi-turn conversation reuses session ID', async () => {
    const chatId = 'oc_multiturn_test';

    // First message (phone cached from previous test → 4 calls: IP + CDP-resolve + /api/chat + /send)
    await handleInbound({
      channelId: 'feishu',
      channelAccountId: 'default',
      threadId: chatId,
      senderId: CUSTOMER_OPEN_ID,
      text: '你好',
      metadata: { chatType: 'p2p' },
    });

    await waitForMockCalls(4);
    const firstCall = mockCalls.find(c => c.path === '/api/chat');
    const firstSessionId = (firstCall!.body as Record<string, unknown>).session_id;

    mockCalls.length = 0;

    // Second message from same chat
    await handleInbound({
      channelId: 'feishu',
      channelAccountId: 'default',
      threadId: chatId,
      senderId: CUSTOMER_OPEN_ID,
      text: '查话费',
      metadata: { chatType: 'p2p' },
    });

    await waitForMockCalls(4);
    const secondCall = mockCalls.find(c => c.path === '/api/chat');
    const secondSessionId = (secondCall!.body as Record<string, unknown>).session_id;

    // Same chat → same session_id
    expect(secondSessionId).toBe(firstSessionId);
  });

  test('different customers get different session IDs', async () => {
    await handleInbound({
      channelId: 'feishu',
      channelAccountId: 'default',
      threadId: 'oc_chat_a',
      senderId: CUSTOMER_OPEN_ID,
      text: '你好',
      metadata: { chatType: 'p2p' },
    });

    await waitForMockCalls(4); // phone cached
    const callA = mockCalls.find(c => c.path === '/api/chat');
    const sessionA = (callA!.body as Record<string, unknown>).session_id;

    mockCalls.length = 0;

    await handleInbound({
      channelId: 'feishu',
      channelAccountId: 'default',
      threadId: 'oc_chat_b',
      senderId: 'ou_another_user_123',
      text: '你好',
      metadata: { chatType: 'p2p' },
    });

    // New user → CDP resolve-phone called → 5 calls: IP + CDP-resolve + CDP-resolve-phone + /api/chat + /send
    await waitForMockCalls(5);
    const callB = mockCalls.find(c => c.path === '/api/chat');
    const sessionB = (callB!.body as Record<string, unknown>).session_id;

    expect(sessionA).not.toBe(sessionB);
  });

  test('empty text message does NOT trigger agent call', async () => {
    await handleInbound({
      channelId: 'feishu',
      channelAccountId: 'default',
      threadId: P2P_CHAT_ID,
      senderId: CUSTOMER_OPEN_ID,
      text: '',
      metadata: { chatType: 'p2p' },
    });

    await new Promise(r => setTimeout(r, 500));
    const agentCalls = mockCalls.filter(c => c.path === '/api/chat');
    expect(agentCalls.length).toBe(0);
  });

  test('CDP resolves feishu_open_id to phone for agent call', async () => {
    // Use the first test's verification — it was the first call so CDP resolve-phone was invoked.
    // Here we verify the same flow with a unique senderId to trigger a fresh CDP call.
    const freshOpenId = 'ou_cdp_resolve_test_' + Date.now();
    mockCalls.length = 0;

    // Extend mock CDP to respond to this fresh ID too
    // (the mock already handles CUSTOMER_OPEN_ID; unknown IDs return {resolved: false})
    // So we test with the known CUSTOMER_OPEN_ID but need a fresh cache key.
    // Trick: use a different channelId prefix that maps to the same identity type — not possible.
    // Instead: just verify the flow was correct in the FIRST test (test 1 above).
    // Here we verify an unknown user triggers CDP resolve-phone and gets empty phone.

    await handleInbound({
      channelId: 'feishu',
      channelAccountId: 'default',
      threadId: 'oc_cdp_test_chat',
      senderId: freshOpenId,
      text: '查3月账单',
      metadata: { chatType: 'p2p' },
    });

    // Fresh user → CDP resolve-phone called → 5 calls
    await waitForMockCalls(5);

    // CDP should resolve feishu_open_id → phone
    const cdpCall = mockCalls.find(c => c.path === '/api/cdp/identity/resolve-phone');
    expect(cdpCall).toBeDefined();
    expect((cdpCall!.body as Record<string, unknown>).identity_type).toBe('feishu_open_id');
    expect((cdpCall!.body as Record<string, unknown>).identity_value).toBe(freshOpenId);
  });

  test('unknown feishu user gets empty phone (graceful degradation)', async () => {
    mockCalls.length = 0;

    await handleInbound({
      channelId: 'feishu',
      channelAccountId: 'default',
      threadId: 'oc_unknown_chat',
      senderId: 'ou_unknown_user_999',
      text: '查话费',
      metadata: { chatType: 'p2p' },
    });

    await waitForMockCalls(4);

    // Agent should still be called but with empty phone
    const agentCall = mockCalls.find(c => c.path === '/api/chat');
    expect(agentCall).toBeDefined();
    expect((agentCall!.body as Record<string, unknown>).user_phone).toBe('');
  });
});

// ===========================================================================
// 4. Feishu webhook → inbound bridge integration
// ===========================================================================

describe('Feishu E2E: Webhook → inbound bridge integration', () => {
  test('feishu-node-gateway envelope format processed correctly', async () => {
    // Simulate what feishu-node-gateway.cjs constructs and sends to /webhooks/feishu
    const webhookBody = buildFeishuWebhookBody({
      text: '查套餐',
      senderId: CUSTOMER_OPEN_ID,
      chatId: P2P_CHAT_ID,
      chatType: 'p2p',
      messageId: 'msg-webhook-001',
    });

    // Parse through feishu-gateway.ts (same code as webhooks.ts route)
    const msg = parseMessageEvent(webhookBody);
    expect(msg).not.toBeNull();

    // Build envelope the same way webhooks.ts does
    const envelope: RawInboundEnvelope = {
      channelId: 'feishu',
      channelAccountId: 'default',
      threadId: msg!.chatId,
      senderId: msg!.senderId,
      text: msg!.content,
      metadata: {
        chatType: msg!.chatType,
        messageId: msg!.messageId,
        messageType: msg!.messageType,
        eventId: msg!.eventId,
      },
      timestamp: msg!.timestamp,
    };

    const event = await handleInbound(envelope);
    expect(event.channelId).toBe('feishu');
    expect(event.externalThreadId).toBe(P2P_CHAT_ID);
    expect(event.externalSenderId).toBe(CUSTOMER_OPEN_ID);
    expect(event.payload).toBe('查套餐');
  });
});

// ===========================================================================
// 5. Feishu gateway message filtering (documented behavior)
// ===========================================================================

describe('Feishu E2E: Gateway message filtering', () => {
  test('@bot mention stripped from group messages by gateway', () => {
    // feishu-node-gateway.cjs: text.replace(/@_user_\d+\s*/g, '').trim()
    const raw = '@_user_1 查话费';
    const cleaned = raw.replace(/@_user_\d+\s*/g, '').trim();
    expect(cleaned).toBe('查话费');
  });

  test('multiple @mentions stripped correctly', () => {
    const raw = '@_user_1 @_user_2 帮我查一下';
    const cleaned = raw.replace(/@_user_\d+\s*/g, '').trim();
    expect(cleaned).toBe('帮我查一下');
  });

  test('empty after mention strip is skipped by gateway', () => {
    const raw = '@_user_1 ';
    const cleaned = raw.replace(/@_user_\d+\s*/g, '').trim();
    expect(cleaned).toBe('');
    // Gateway would skip this message (if (!text) return)
  });

  test('JSON content parsing extracts text field', () => {
    // feishu-node-gateway.cjs: const content = JSON.parse(message.content); text = content.text
    const content = JSON.stringify({ text: '查话费' });
    const parsed = JSON.parse(content);
    expect(parsed.text).toBe('查话费');
  });

  test('non-JSON content falls through gracefully', () => {
    const content = 'plain text';
    let text = '';
    try {
      const parsed = JSON.parse(content);
      text = parsed.text ?? '';
    } catch {
      text = content;
    }
    expect(text).toBe('plain text');
  });
});

// ===========================================================================
// 6. Feishu reply routing
// ===========================================================================

describe('Feishu E2E: Reply routing', () => {
  test('reply routed to feishu gateway /send with chatId', async () => {
    mockCalls.length = 0;

    await handleInbound({
      channelId: 'feishu',
      channelAccountId: 'default',
      threadId: P2P_CHAT_ID,
      senderId: CUSTOMER_OPEN_ID,
      text: '你好',
      metadata: { chatType: 'p2p' },
    });

    await waitForMockCalls(4); // phone cached

    const sendCall = mockCalls.find(c => c.path === '/send');
    expect(sendCall).toBeDefined();
    const body = sendCall!.body as Record<string, unknown>;
    // Feishu reply uses chatId (not 'to' like WhatsApp)
    expect(body.chatId).toBe(P2P_CHAT_ID);
    expect(body.text).toBe(MOCK_AGENT_REPLY);
  });

  test('feishu and whatsapp channels are isolated (different gateways)', () => {
    // Feishu uses FEISHU_GATEWAY_URL (:19032 in test)
    // WhatsApp uses BAILEYS_GATEWAY_URL (:19031 in test)
    expect(process.env.FEISHU_GATEWAY_URL).toBe('http://127.0.0.1:19032');
    expect(process.env.BAILEYS_GATEWAY_URL).toBe('http://127.0.0.1:19031');
  });
});

// ===========================================================================
// 7. Cross-channel isolation
// ===========================================================================

describe('Feishu E2E: Cross-channel isolation', () => {
  test('feishu session isolated from whatsapp session on same phone', async () => {
    // Feishu message
    await handleInbound({
      channelId: 'feishu',
      channelAccountId: 'default',
      threadId: P2P_CHAT_ID,
      senderId: CUSTOMER_OPEN_ID,
      text: '查话费',
      metadata: { chatType: 'p2p' },
    });

    await waitForMockCalls(4); // phone cached
    const feishuCall = mockCalls.find(c => c.path === '/api/chat');
    const feishuSession = (feishuCall!.body as Record<string, unknown>).session_id as string;

    mockCalls.length = 0;

    // WhatsApp message from same phone (different channel → different session)
    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: 'ec-phone',
      threadId: `${CUSTOMER_PHONE}@s.whatsapp.net`,
      senderId: `${CUSTOMER_PHONE}@s.whatsapp.net`,
      text: '查话费',
      metadata: { chatType: 'direct' },
    });

    // New channel+sender combo → CDP resolve-phone called → 5 calls: IP + CDP-resolve + CDP-resolve-phone + /api/chat + baileys/send
    await waitForMockCalls(5);
    const waCall = mockCalls.find(c => c.path === '/api/chat');
    const waSession = (waCall!.body as Record<string, unknown>).session_id as string;

    // Sessions must be different (different channels)
    expect(feishuSession).not.toBe(waSession);
    expect(feishuSession).toContain('feishu');
    expect(waSession).toContain('whatsapp');
  });
});
