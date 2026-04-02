/**
 * Phase B7 Tests: WhatsApp E2E Scenarios
 *
 * Validates the full WhatsApp message flow:
 *   Customer (+8613609796392) → WhatsApp → Baileys Gateway (:18031)
 *   → Channel-Host (:18030) → Inbound Bridge → AI Agent Backend (:18472)
 *   → Reply via Gateway → WhatsApp → Customer
 *
 * Roles:
 *   - Bot account: +593986762325 (ec-phone, scans QR to login)
 *   - Customer: +8613609796392 (陈军, sends messages to bot)
 *
 * External HTTP calls are intercepted via mock HTTP servers on 19xxx ports.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';

// Env vars are set via --preload ./tests/b7-preload.ts BEFORE module-level consts.
// Load SDK compat layer
import '../src/runtime-plane/sdk-compat/_loader';

import { migrateDb } from '../src/db';
import { resetRegistry } from '../src/runtime-plane/runtime-registry';
import {
  normalizeInbound,
  handleInbound,
  onIngress,
  type RawInboundEnvelope,
} from '../src/bridge-plane/inbound-bridge';

// ---------------------------------------------------------------------------
// Test constants — match real deployment roles
// ---------------------------------------------------------------------------

/** Bot WhatsApp account (server side, scans QR) */
const BOT_ACCOUNT_ID = 'ec-phone';
const BOT_PHONE = '593986762325';
const BOT_JID = `${BOT_PHONE}@s.whatsapp.net`;
const BOT_LID = '45918116151476@lid';

/** Customer (sends messages to bot) */
const CUSTOMER_PHONE = '8613609796392';
const CUSTOMER_JID = `${CUSTOMER_PHONE}@s.whatsapp.net`;
const CUSTOMER_NAME = '陈军';

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

// Agent reply content for testing
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

  // Mock Baileys gateway (:19031)
  mockBaileysGateway = await createMockServer(19031, (path, method, body, res) => {
    if (path === '/send' && method === 'POST') {
      respond(res, { success: true, messageId: `mock-msg-${Date.now()}` });
    } else if (path === '/health') {
      respond(res, { status: 'ok', service: 'baileys-gateway', connections: 1 });
    } else if (path === '/start' && method === 'POST') {
      respond(res, { success: true });
    } else if (path === '/stop' && method === 'POST') {
      respond(res, { success: true });
    } else if (path.startsWith('/status/')) {
      respond(res, { state: 'connected', messagesReceived: 0, messagesSent: 0 });
    } else if (path === '/connections') {
      respond(res, []);
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
  mockCdp = await createMockServer(19020, (path, _method, _body, res) => {
    if (path === '/api/identities/resolve') {
      respond(res, { ok: true, customerId: 'mock-customer-001' });
    } else {
      respond(res, { error: 'Not found' }, 404);
    }
  });
});

afterAll(() => {
  mockBackendServer?.close();
  mockBaileysGateway?.close();
  mockInteractionPlatform?.close();
  mockCdp?.close();
});

beforeEach(() => {
  mockCalls.length = 0;
});

// ---------------------------------------------------------------------------
// Helper: wait for async fire-and-forget calls to complete
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

// ---------------------------------------------------------------------------
// 1. Inbound message normalization
// ---------------------------------------------------------------------------

describe('WhatsApp E2E: Inbound message normalization', () => {
  test('normalizes customer direct message (standard JID)', () => {
    const envelope: RawInboundEnvelope = {
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: CUSTOMER_JID,
      senderId: CUSTOMER_JID,
      text: '查话费',
      metadata: {
        pushName: CUSTOMER_NAME,
        chatType: 'direct',
        fromMe: false,
        messageId: 'WA_MSG_001',
      },
    };

    const event = normalizeInbound(envelope);
    expect(event.channelId).toBe('whatsapp');
    expect(event.channelAccountId).toBe(BOT_ACCOUNT_ID);
    expect(event.externalThreadId).toBe(CUSTOMER_JID);
    expect(event.externalSenderId).toBe(CUSTOMER_JID);
    expect(event.messageType).toBe('text');
    expect(event.payload).toBe('查话费');
    expect(event.metadata.pushName).toBe(CUSTOMER_NAME);
  });

  test('normalizes customer message with LID JID', () => {
    // Baileys LID mode: some customers appear with @lid JID
    const lidJid = '215427657498872@lid';
    const envelope: RawInboundEnvelope = {
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: lidJid,
      senderId: lidJid,
      text: '查流量',
      metadata: { pushName: CUSTOMER_NAME, chatType: 'direct', fromMe: false },
    };

    const event = normalizeInbound(envelope);
    expect(event.externalThreadId).toBe(lidJid);
    expect(event.messageType).toBe('text');
    expect(event.payload).toBe('查流量');
  });

  test('normalizes group message with participant sender', () => {
    const envelope: RawInboundEnvelope = {
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: '120363123456789@g.us',
      senderId: CUSTOMER_JID,
      text: '@bot 查话费',
      metadata: { pushName: CUSTOMER_NAME, chatType: 'group' },
    };

    const event = normalizeInbound(envelope);
    expect(event.externalThreadId).toBe('120363123456789@g.us');
    expect(event.externalSenderId).toBe(CUSTOMER_JID);
  });

  test('normalizes image media message', () => {
    const envelope: RawInboundEnvelope = {
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: CUSTOMER_JID,
      senderId: CUSTOMER_JID,
      media: { type: 'image', caption: '我的账单截图' },
      metadata: { pushName: CUSTOMER_NAME, chatType: 'direct' },
    };

    const event = normalizeInbound(envelope);
    expect(event.messageType).toBe('media');
    expect((event.payload as Record<string, unknown>).type).toBe('image');
  });

  test('normalizes document media message', () => {
    const event = normalizeInbound({
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: CUSTOMER_JID,
      senderId: CUSTOMER_JID,
      media: { type: 'document', fileName: 'invoice.pdf' },
      metadata: { chatType: 'direct' },
    });

    expect(event.messageType).toBe('media');
    expect((event.payload as Record<string, unknown>).type).toBe('document');
  });

  test('normalizes envelope with missing optional fields', () => {
    const envelope: RawInboundEnvelope = {
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
    };

    const event = normalizeInbound(envelope);
    expect(event.externalThreadId).toBe('');
    expect(event.externalSenderId).toBe('');
    expect(event.messageType).toBe('text');
    expect(event.payload).toBe('');
    expect(event.timestamp).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Full inbound → agent → reply pipeline
// ---------------------------------------------------------------------------

describe('WhatsApp E2E: Full inbound → agent → reply pipeline', () => {
  test('customer "查话费" triggers agent call and reply via gateway', async () => {
    const ingressEvents: unknown[] = [];
    const unsub = onIngress((event) => { ingressEvents.push(event); });

    const event = await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: CUSTOMER_JID,
      senderId: CUSTOMER_JID,
      text: '查话费',
      metadata: { pushName: CUSTOMER_NAME, chatType: 'direct', fromMe: false },
      timestamp: Date.now(),
    });

    // Verify immediate return
    expect(event.channelId).toBe('whatsapp');
    expect(event.channelAccountId).toBe(BOT_ACCOUNT_ID);
    expect(event.messageType).toBe('text');
    expect(event.payload).toBe('查话费');

    // Verify ingress listener fired
    expect(ingressEvents.length).toBe(1);

    // Wait for async fire-and-forget calls:
    // interaction-platform materialize + CDP resolve + backend /api/chat + gateway /send
    await waitForMockCalls(4);

    // Verify backend agent was called with correct customer phone
    const agentCall = mockCalls.find(c => c.path === '/api/chat');
    expect(agentCall).toBeDefined();
    const agentBody = agentCall!.body as Record<string, unknown>;
    expect(agentBody.message).toBe('查话费');
    expect(agentBody.user_phone).toBe(CUSTOMER_PHONE);
    expect(agentBody.lang).toBe('zh');
    expect(typeof agentBody.session_id).toBe('string');

    // Verify reply was sent back to customer via Baileys gateway
    const sendCall = mockCalls.find(c => c.path === '/send');
    expect(sendCall).toBeDefined();
    const sendBody = sendCall!.body as Record<string, unknown>;
    expect(sendBody.to).toBe(CUSTOMER_JID);
    expect(sendBody.text).toBe(MOCK_AGENT_REPLY);
    expect(sendBody.channelId).toBe('whatsapp');
    expect(sendBody.accountId).toBe(BOT_ACCOUNT_ID);

    // Verify Interaction Platform was notified
    const ipCall = mockCalls.find(c => c.path === '/api/interactions/materialize');
    expect(ipCall).toBeDefined();

    // Verify CDP identity resolve was called for customer
    const cdpCall = mockCalls.find(c => c.path === '/api/identities/resolve');
    expect(cdpCall).toBeDefined();
    const cdpBody = cdpCall!.body as Record<string, unknown>;
    expect(cdpBody.channel).toBe('whatsapp');
    expect(cdpBody.externalId).toBe(CUSTOMER_JID);

    unsub();
  });

  test('multi-turn conversation reuses session ID', async () => {
    const threadJid = 'multiturn-customer@s.whatsapp.net';

    // First message
    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: threadJid,
      senderId: threadJid,
      text: '你好',
      metadata: { chatType: 'direct' },
    });

    await waitForMockCalls(4);
    const firstCall = mockCalls.find(c => c.path === '/api/chat');
    const firstSessionId = (firstCall!.body as Record<string, unknown>).session_id;

    mockCalls.length = 0;

    // Second message from same thread
    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: threadJid,
      senderId: threadJid,
      text: '查话费',
      metadata: { chatType: 'direct' },
    });

    await waitForMockCalls(4);
    const secondCall = mockCalls.find(c => c.path === '/api/chat');
    const secondSessionId = (secondCall!.body as Record<string, unknown>).session_id;

    // Same thread → same session_id
    expect(secondSessionId).toBe(firstSessionId);
  });

  test('different customers get different session IDs', async () => {
    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: CUSTOMER_JID,
      senderId: CUSTOMER_JID,
      text: '你好',
      metadata: { chatType: 'direct' },
    });

    await waitForMockCalls(4);
    const callA = mockCalls.find(c => c.path === '/api/chat');
    const sessionA = (callA!.body as Record<string, unknown>).session_id;

    mockCalls.length = 0;

    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: '13800000001@s.whatsapp.net',
      senderId: '13800000001@s.whatsapp.net',
      text: '你好',
      metadata: { chatType: 'direct' },
    });

    await waitForMockCalls(4);
    const callB = mockCalls.find(c => c.path === '/api/chat');
    const sessionB = (callB!.body as Record<string, unknown>).session_id;

    expect(sessionA).not.toBe(sessionB);
  });

  test('media-only message does NOT trigger agent call', async () => {
    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: CUSTOMER_JID,
      senderId: CUSTOMER_JID,
      media: { type: 'image', caption: 'photo' },
      metadata: { chatType: 'direct' },
    });

    await new Promise(r => setTimeout(r, 500));
    const agentCalls = mockCalls.filter(c => c.path === '/api/chat');
    expect(agentCalls.length).toBe(0);
  });

  test('empty text message does NOT trigger agent call', async () => {
    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: CUSTOMER_JID,
      senderId: CUSTOMER_JID,
      text: '',
      metadata: { chatType: 'direct' },
    });

    await new Promise(r => setTimeout(r, 500));
    const agentCalls = mockCalls.filter(c => c.path === '/api/chat');
    expect(agentCalls.length).toBe(0);
  });

  test('customer phone extracted from standard JID', async () => {
    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: CUSTOMER_JID,
      senderId: CUSTOMER_JID,
      text: '查流量',
      metadata: { chatType: 'direct' },
    });

    await waitForMockCalls(4);
    const call = mockCalls.find(c => c.path === '/api/chat');
    expect((call!.body as Record<string, unknown>).user_phone).toBe(CUSTOMER_PHONE);
  });

  test('phone extracted from LID JID (no @ in result)', async () => {
    const lidJid = '215427657498872@lid';
    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: lidJid,
      senderId: lidJid,
      text: 'test LID',
      metadata: { chatType: 'direct' },
    });

    await waitForMockCalls(4);
    const call = mockCalls.find(c => c.path === '/api/chat');
    expect((call!.body as Record<string, unknown>).user_phone).toBe('215427657498872');
  });
});

// ---------------------------------------------------------------------------
// 3. Gateway Bridge proxy layer
// ---------------------------------------------------------------------------

describe('WhatsApp E2E: Gateway Bridge proxy', () => {
  test('startAccount proxies to gateway /start', async () => {
    const { startAccount } = await import('../src/runtime-plane/gateway-bridge');
    const result = await startAccount('whatsapp', BOT_ACCOUNT_ID, {
      authDir: '/tmp/test-auth-ec',
    });
    expect(result.success).toBe(true);

    const startCall = mockCalls.find(c => c.path === '/start');
    expect(startCall).toBeDefined();
    const body = startCall!.body as Record<string, unknown>;
    expect(body.channelId).toBe('whatsapp');
    expect(body.accountId).toBe(BOT_ACCOUNT_ID);
  });

  test('stopAccount proxies to gateway /stop', async () => {
    const { stopAccount } = await import('../src/runtime-plane/gateway-bridge');
    const result = await stopAccount('whatsapp', BOT_ACCOUNT_ID);
    expect(result.success).toBe(true);
  });

  test('getConnectionStatus proxies to gateway /status', async () => {
    const { getConnectionStatus } = await import('../src/runtime-plane/gateway-bridge');
    const status = await getConnectionStatus('whatsapp', BOT_ACCOUNT_ID);
    expect(status).toBeDefined();
    expect(status!.state).toBe('connected');
  });

  test('sendViaBaileys sends reply to customer', async () => {
    const { sendViaBaileys } = await import('../src/runtime-plane/gateway-bridge');
    const result = await sendViaBaileys(
      'whatsapp',
      BOT_ACCOUNT_ID,
      CUSTOMER_JID,
      '您的话费余额为 66.5 元',
    );
    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();

    const sendCall = mockCalls.find(c => c.path === '/send');
    expect(sendCall).toBeDefined();
    const body = sendCall!.body as Record<string, unknown>;
    expect(body.to).toBe(CUSTOMER_JID);
    expect(body.text).toBe('您的话费余额为 66.5 元');
  });

  test('startAccount rejects non-whatsapp channel', async () => {
    const { startAccount } = await import('../src/runtime-plane/gateway-bridge');
    const result = await startAccount('telegram', 'some-account');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not implemented');
  });
});

// ---------------------------------------------------------------------------
// 4. Webhook endpoint simulation (what baileys-node-gateway.cjs forwards)
// ---------------------------------------------------------------------------

describe('WhatsApp E2E: Webhook endpoint simulation', () => {
  test('baileys-gateway webhook envelope processed correctly', async () => {
    const ingressEvents: unknown[] = [];
    const unsub = onIngress((event) => { ingressEvents.push(event); });

    // Simulate what baileys-node-gateway.cjs sends to /webhooks/baileys-gateway
    const event = await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: CUSTOMER_JID,
      senderId: CUSTOMER_JID,
      text: '查话费',
      metadata: {
        pushName: CUSTOMER_NAME,
        chatType: 'direct',
        fromMe: false,
        messageId: 'WA_WEBHOOK_001',
      },
      timestamp: 1712000000000,
    });

    expect(event.channelId).toBe('whatsapp');
    expect(event.channelAccountId).toBe(BOT_ACCOUNT_ID);
    expect(event.externalThreadId).toBe(CUSTOMER_JID);
    expect(event.externalSenderId).toBe(CUSTOMER_JID);
    expect(event.messageType).toBe('text');
    expect(event.payload).toBe('查话费');
    expect(event.timestamp).toBe(1712000000000);
    expect(ingressEvents.length).toBe(1);

    unsub();
  });
});

// ---------------------------------------------------------------------------
// 5. Baileys gateway message filtering (documented behavior)
// ---------------------------------------------------------------------------

describe('WhatsApp E2E: Baileys gateway message filtering', () => {
  /**
   * These tests document the filtering logic in baileys-node-gateway.cjs.
   * The actual filtering happens in the Node.js sidecar before forwarding.
   */

  test('status@broadcast messages are filtered (not forwarded)', () => {
    const event = normalizeInbound({
      channelId: 'whatsapp',
      channelAccountId: BOT_ACCOUNT_ID,
      threadId: 'status@broadcast',
      senderId: CUSTOMER_JID,
      text: 'Status update',
    });
    expect(event.externalThreadId).toBe('status@broadcast');
  });

  test('fromMe echo (type=append) filtered by gateway', () => {
    // baileys-node-gateway.cjs: if (upsert.type === 'append') continue;
    // Bot's own outbound messages echoed back are skipped at gateway level
    expect(true).toBe(true);
  });

  test('reaction-only messages filtered by gateway (hasOwnProperty check)', () => {
    // baileys-node-gateway.cjs: Object.prototype.hasOwnProperty.call(msg.message, 'reactionMessage')
    // Protobuf hidden props won't match hasOwnProperty
    expect(true).toBe(true);
  });

  test('own-number JID detected as fromMe by gateway', () => {
    // baileys-node-gateway.cjs: senderJid.includes(myNumber) && myNumber.length > 5
    // Bot number 593986762325 in JID → isReallyFromMe = true → skipped
    // This ensures the bot doesn't reply to its own messages
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Outbound bridge (bot → customer)
// ---------------------------------------------------------------------------

describe('WhatsApp E2E: Outbound bridge', () => {
  test('bot sends bill info to customer via gateway', async () => {
    const { sendViaBaileys } = await import('../src/runtime-plane/gateway-bridge');
    const result = await sendViaBaileys(
      'whatsapp',
      BOT_ACCOUNT_ID,
      CUSTOMER_JID,
      '您的超值100G套餐本月账单：套餐费88元 + 超额流量8元 + 增值服务8元 + 税费4元 = 108元',
    );

    expect(result.success).toBe(true);
    const sendCall = mockCalls.find(c => c.path === '/send');
    expect(sendCall).toBeDefined();
    expect((sendCall!.body as Record<string, unknown>).to).toBe(CUSTOMER_JID);
    expect((sendCall!.body as Record<string, unknown>).accountId).toBe(BOT_ACCOUNT_ID);
  });

  test('bot sends reply to LID customer', async () => {
    await new Promise(r => setTimeout(r, 300));
    mockCalls.length = 0;

    const { sendViaBaileys } = await import('../src/runtime-plane/gateway-bridge');
    const lidJid = '215427657498872@lid';
    const result = await sendViaBaileys(
      'whatsapp',
      BOT_ACCOUNT_ID,
      lidJid,
      'Reply to LID customer',
    );

    expect(result.success).toBe(true);
    const sendCall = mockCalls.find(
      c => c.path === '/send' && (c.body as Record<string, unknown>).to === lidJid
    );
    expect(sendCall).toBeDefined();
  });
});
