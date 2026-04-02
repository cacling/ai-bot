/**
 * Phase B6 Tests: Gateway Bridge
 *
 * Validates: Gateway bridge module manages connections, routes inbound
 * messages to the Inbound Bridge, and provides outbound send via Baileys.
 *
 * Note: These are unit tests using the gateway bridge API directly.
 * Real Baileys E2E requires a live WhatsApp account (see manual test section).
 */

import { describe, test, expect, beforeAll } from 'bun:test';

// Load the SDK compat layer FIRST
import '../src/runtime-plane/sdk-compat/_loader';

// DB setup
process.env.CHANNEL_HOST_DB_PATH = './data/test-b6.db';
import { migrateDb } from '../src/db';
import { resetRegistry } from '../src/runtime-plane/runtime-registry';
import {
  startAccount,
  stopAccount,
  getConnectionStatus,
  listConnectionStatuses,
  sendViaBaileys,
} from '../src/runtime-plane/gateway-bridge';
import { onIngress, normalizeInbound, type RawInboundEnvelope } from '../src/bridge-plane/inbound-bridge';
import { handleOutbound } from '../src/bridge-plane/outbound-bridge';

beforeAll(() => {
  const { mkdirSync, existsSync } = require('fs');
  if (!existsSync('./data')) mkdirSync('./data', { recursive: true });
  migrateDb();
  resetRegistry();
});

// ---------------------------------------------------------------------------
// Unit tests for gateway bridge API (no real Baileys)
// ---------------------------------------------------------------------------

describe('Gateway Bridge API', () => {
  test('getConnectionStatus returns undefined for unknown account', () => {
    const status = getConnectionStatus('whatsapp', 'nonexistent');
    expect(status).toBeUndefined();
  });

  test('listConnectionStatuses returns empty array initially', () => {
    const statuses = listConnectionStatuses();
    expect(Array.isArray(statuses)).toBe(true);
  });

  test('sendViaBaileys fails when no active connection', async () => {
    const result = await sendViaBaileys('whatsapp', 'no-conn', '+1234567890', 'hello');
    expect(result.success).toBe(false);
    expect(result.error).toContain('No active connection');
  });

  test('startAccount rejects unsupported channel', async () => {
    const result = await startAccount('slack', 'test-account');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not implemented');
  });

  test('stopAccount returns error for unknown connection', async () => {
    const result = await stopAccount('whatsapp', 'nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('No connection found');
  });
});

// ---------------------------------------------------------------------------
// Inbound Bridge normalization (used by gateway bridge callback)
// ---------------------------------------------------------------------------

describe('Gateway Bridge inbound normalization', () => {
  test('normalizes WhatsApp WebInboundMessage-like envelope', () => {
    const envelope: RawInboundEnvelope = {
      channelId: 'whatsapp',
      channelAccountId: 'wa-001',
      threadId: '8613800138000@s.whatsapp.net',
      senderId: '+8613800138000',
      text: 'Hello from WhatsApp',
      metadata: {
        pushName: 'Test User',
        chatType: 'direct',
        fromMe: false,
        messageId: 'ABCDEF123456',
      },
      timestamp: 1712000000000,
    };

    const event = normalizeInbound(envelope);
    expect(event.channelId).toBe('whatsapp');
    expect(event.channelAccountId).toBe('wa-001');
    expect(event.externalThreadId).toBe('8613800138000@s.whatsapp.net');
    expect(event.externalSenderId).toBe('+8613800138000');
    expect(event.messageType).toBe('text');
    expect(event.payload).toBe('Hello from WhatsApp');
    expect(event.metadata.pushName).toBe('Test User');
    expect(event.timestamp).toBe(1712000000000);
  });

  test('normalizes media message envelope', () => {
    const envelope: RawInboundEnvelope = {
      channelId: 'whatsapp',
      channelAccountId: 'wa-001',
      threadId: '120363123456789@g.us',
      senderId: '+8613800138000',
      media: {
        path: '/tmp/image.jpg',
        type: 'image/jpeg',
        fileName: 'photo.jpg',
      },
      metadata: {
        chatType: 'group',
        groupSubject: 'Test Group',
      },
    };

    const event = normalizeInbound(envelope);
    expect(event.messageType).toBe('media');
    expect((event.payload as Record<string, unknown>).type).toBe('image/jpeg');
    expect(event.metadata.groupSubject).toBe('Test Group');
  });

  test('ingress listener receives bridged events', async () => {
    const received: unknown[] = [];
    const unsub = onIngress((event) => { received.push(event); });

    const { handleInbound } = await import('../src/bridge-plane/inbound-bridge');
    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: 'wa-bridge-test',
      threadId: '1234@s.whatsapp.net',
      senderId: '+1234567890',
      text: 'Bridge test',
    });

    expect(received.length).toBe(1);
    const evt = received[0] as Record<string, unknown>;
    expect(evt.channelId).toBe('whatsapp');
    expect(evt.payload).toBe('Bridge test');

    unsub();
  });
});

// ---------------------------------------------------------------------------
// Outbound Bridge with Baileys fallback
// ---------------------------------------------------------------------------

describe('Outbound Bridge Baileys integration', () => {
  test('outbound falls back to plugin adapter when no Baileys connection', async () => {
    // No active Baileys connection → sendViaBaileys returns success=false
    // → falls through to dispatchToPlugin → which also fails (no channel registered)
    // → returns error
    const result = await handleOutbound({
      channelId: 'whatsapp',
      channelAccountId: 'wa-no-conn',
      externalThreadId: '+1234567890',
      messageType: 'text',
      payload: 'test',
      metadata: {},
    });

    // Should fail because neither Baileys nor plugin adapter is available
    // (whatsapp channel not registered in registry for this test)
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration flow simulation
// ---------------------------------------------------------------------------

describe('E2E flow simulation (mocked)', () => {
  test('simulated inbound → bridge → listener pipeline', async () => {
    const events: unknown[] = [];
    const unsub = onIngress((event) => { events.push(event); });

    // Simulate what the gateway bridge onMessage callback does
    const { handleInbound } = await import('../src/bridge-plane/inbound-bridge');

    // Simulate a WhatsApp text message
    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: 'wa-e2e-001',
      threadId: '8613900139000@s.whatsapp.net',
      senderId: '+8613900139000',
      text: 'Can you help me with my order?',
      metadata: {
        pushName: 'Customer Li',
        chatType: 'direct',
        fromMe: false,
        messageId: 'WA_MSG_001',
      },
      timestamp: Date.now(),
    });

    // Simulate a WhatsApp group message
    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: 'wa-e2e-001',
      threadId: '120363000111222@g.us',
      senderId: '+8613800138000',
      text: '@bot What is the status?',
      metadata: {
        pushName: 'Team Lead',
        chatType: 'group',
        groupSubject: 'Support Team',
        mentions: ['bot@s.whatsapp.net'],
      },
      timestamp: Date.now(),
    });

    // Simulate a WhatsApp media message
    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: 'wa-e2e-001',
      threadId: '8613900139000@s.whatsapp.net',
      senderId: '+8613900139000',
      media: {
        path: '/tmp/receipt.pdf',
        type: 'application/pdf',
        fileName: 'receipt.pdf',
      },
      metadata: { pushName: 'Customer Li', chatType: 'direct' },
    });

    expect(events.length).toBe(3);
    expect((events[0] as Record<string, unknown>).messageType).toBe('text');
    expect((events[1] as Record<string, unknown>).messageType).toBe('text');
    expect((events[2] as Record<string, unknown>).messageType).toBe('media');

    unsub();
  });
});

// ---------------------------------------------------------------------------
// Manual E2E Test Instructions (not automated)
// ---------------------------------------------------------------------------

describe('Manual E2E instructions', () => {
  test('prints instructions for real WhatsApp E2E test', () => {
    console.log(`
=== WhatsApp Real E2E Test Instructions ===

1. Start channel-host:
   cd channel_host && bun run src/index.ts

2. Create an account:
   curl -X POST http://localhost:18030/api/channels/whatsapp/accounts \\
     -H 'Content-Type: application/json' \\
     -d '{"pluginId":"whatsapp","config":{}}'
   # Note the returned account ID

3. Start the gateway connection:
   curl -X POST http://localhost:18030/api/channels/whatsapp/accounts/{ACCOUNT_ID}/start \\
     -H 'Content-Type: application/json' \\
     -d '{}'
   # Watch the terminal for QR code (first time only)
   # Scan with WhatsApp on your phone

4. Check connection status:
   curl http://localhost:18030/api/channels/whatsapp/accounts/{ACCOUNT_ID}/connection

5. Send a message TO the WhatsApp number to test inbound.
   Watch the terminal for "[channel-host] + [inbound] whatsapp: ..." logs.

6. Test outbound (send from bot):
   curl -X POST http://localhost:18030/api/outbound/send \\
     -H 'Content-Type: application/json' \\
     -d '{"channelId":"whatsapp","channelAccountId":"{ACCOUNT_ID}","externalThreadId":"{PHONE}@s.whatsapp.net","messageType":"text","payload":"Hello from channel-host!","metadata":{}}'

7. Stop the connection:
   curl -X POST http://localhost:18030/api/channels/whatsapp/accounts/{ACCOUNT_ID}/stop

================================================
`);
    expect(true).toBe(true);
  });
});
