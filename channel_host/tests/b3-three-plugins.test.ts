/**
 * Phase B3 Tests: Three-Plugin Integration
 *
 * Validates: WhatsApp + Feishu + LINE plugins can be installed, discovered,
 * compatibility-checked with L2 surfaces, and that the Inbound/Outbound
 * Bridge and Channel Account Control Plane work end-to-end.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { resolve } from 'path';

// Load the SDK compat layer FIRST
import '../src/runtime-plane/sdk-compat/_loader';

// DB setup
process.env.CHANNEL_HOST_DB_PATH = './data/test-b3.db';
import { migrateDb } from '../src/db';
import { discoverPluginAt } from '../src/package-plane/manifest-discovery';
import { checkPluginCompatibility } from '../src/package-plane/compatibility-governor';
import { registerChannel, getChannel, listChannels, resetRegistry } from '../src/runtime-plane/runtime-registry';
import { normalizeInbound, handleInbound, onIngress, type RawInboundEnvelope } from '../src/bridge-plane/inbound-bridge';
import { handleOutbound, sendTextMessage } from '../src/bridge-plane/outbound-bridge';
import {
  createAccount,
  getAccount,
  listAccountsByChannel,
  loginAccount,
  logoutAccount,
  getAccountStatus,
  deleteAccount,
} from '../src/control-plane/channel-account';
import type { ChannelIngressEvent, OutboundCommand } from '../src/types';

const OPENCLAW_EXTENSIONS = resolve(import.meta.dir, '../../openclaw-code/extensions');

beforeAll(() => {
  const { mkdirSync, existsSync } = require('fs');
  if (!existsSync('./data')) mkdirSync('./data', { recursive: true });
  migrateDb();
  resetRegistry();
});

// ---------------------------------------------------------------------------
// B3.1: L2 Surface coverage — All three plugins have improved compatibility
// ---------------------------------------------------------------------------

describe('L2 Surface Coverage', () => {
  test('WhatsApp plugin has whatsapp-core, whatsapp-shared, security-runtime surfaces', async () => {
    // Verify L2 surfaces exist by importing them
    const whatsappCore = await import('openclaw/plugin-sdk/whatsapp-core');
    expect(whatsappCore.buildChannelConfigSchema).toBeFunction();
    expect(whatsappCore.normalizeE164).toBeFunction();
    expect(whatsappCore.getChatChannelMeta).toBeFunction();

    const whatsappShared = await import('openclaw/plugin-sdk/whatsapp-shared');
    expect(whatsappShared.createWhatsAppOutboundBase).toBeFunction();
    expect(whatsappShared.looksLikeWhatsAppTargetId).toBeFunction();

    const security = await import('openclaw/plugin-sdk/security-runtime');
    expect(security.createSafeRegex).toBeFunction();
    expect(security.sanitizeExternalContent).toBeFunction();
  });

  test('Feishu plugin has feishu mega-surface', async () => {
    const feishu = await import('openclaw/plugin-sdk/feishu');
    expect(feishu.buildChannelConfigSchema).toBeFunction();
    expect(feishu.buildFeishuConversationId).toBeFunction();
    expect(feishu.createDedupeCache).toBeFunction();
    expect(feishu.feishuSetupWizard).toBeFunction();
    expect(feishu.DEFAULT_ACCOUNT_ID).toBe('default');
    expect(feishu.WEBHOOK_RATE_LIMIT_DEFAULTS).toBeDefined();
  });

  test('LINE plugin surfaces are covered (runtime, group-access, webhook-request-guards)', async () => {
    const runtime = await import('openclaw/plugin-sdk/runtime');
    expect(runtime.logVerbose).toBeFunction();
    expect(runtime.shouldLogVerbose).toBeFunction();

    const groupAccess = await import('openclaw/plugin-sdk/group-access');
    expect(groupAccess.evaluateMatchedGroupAccessForPolicy).toBeFunction();

    const webhookGuards = await import('openclaw/plugin-sdk/webhook-request-guards');
    expect(webhookGuards.WEBHOOK_IN_FLIGHT_DEFAULTS).toBeDefined();
  });

  test('WhatsApp compat report improves with L2 surfaces', async () => {
    const waDir = resolve(OPENCLAW_EXTENSIONS, 'whatsapp');
    const meta = await discoverPluginAt(waDir);
    if (!meta) throw new Error('WhatsApp manifest not found');
    const report = await checkPluginCompatibility(meta);
    // With L2 surfaces, missing count should decrease
    expect(report.missingSurfaces.length).toBeLessThan(47);
  });

  test('Feishu compat report improves with L2 surfaces', async () => {
    const feishuDir = resolve(OPENCLAW_EXTENSIONS, 'feishu');
    const meta = await discoverPluginAt(feishuDir);
    if (!meta) throw new Error('Feishu manifest not found');
    const report = await checkPluginCompatibility(meta);
    expect(report.missingSurfaces.length).toBeLessThan(27);
  });

  test('SDK compat now has 57+ surfaces (53 L1 + 4 L2)', async () => {
    const { Glob } = globalThis.Bun ?? await import('bun');
    const glob = new Glob('*.ts');
    const sdkDir = resolve(import.meta.dir, '../src/runtime-plane/sdk-compat');
    let count = 0;
    for (const file of glob.scanSync({ cwd: sdkDir, onlyFiles: true })) {
      if (!file.startsWith('_')) count++;
    }
    expect(count).toBeGreaterThanOrEqual(57);
  });
});

// ---------------------------------------------------------------------------
// B3.2: Inbound Bridge
// ---------------------------------------------------------------------------

describe('Inbound Bridge', () => {
  test('normalizeInbound converts text envelope', () => {
    const raw: RawInboundEnvelope = {
      channelId: 'whatsapp',
      channelAccountId: 'acct-1',
      threadId: 'thread-123',
      senderId: '+1234567890',
      text: 'Hello from WhatsApp',
    };
    const event = normalizeInbound(raw);
    expect(event.channelId).toBe('whatsapp');
    expect(event.channelAccountId).toBe('acct-1');
    expect(event.externalThreadId).toBe('thread-123');
    expect(event.externalSenderId).toBe('+1234567890');
    expect(event.messageType).toBe('text');
    expect(event.payload).toBe('Hello from WhatsApp');
    expect(event.timestamp).toBeGreaterThan(0);
  });

  test('normalizeInbound converts media envelope', () => {
    const raw: RawInboundEnvelope = {
      channelId: 'feishu',
      channelAccountId: 'acct-2',
      media: { type: 'image', url: 'https://example.com/image.png' },
    };
    const event = normalizeInbound(raw);
    expect(event.messageType).toBe('media');
    expect((event.payload as any).type).toBe('image');
  });

  test('normalizeInbound converts action envelope', () => {
    const raw: RawInboundEnvelope = {
      channelId: 'line',
      channelAccountId: 'acct-3',
      action: { type: 'postback', data: 'action=buy' },
    };
    const event = normalizeInbound(raw);
    expect(event.messageType).toBe('action');
    expect((event.payload as any).type).toBe('postback');
  });

  test('handleInbound dispatches to listeners', async () => {
    const received: ChannelIngressEvent[] = [];
    const unsub = onIngress((evt) => { received.push(evt); });

    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: 'test',
      threadId: 't1',
      senderId: 's1',
      text: 'test message',
    });

    expect(received.length).toBe(1);
    expect(received[0].channelId).toBe('whatsapp');
    expect(received[0].payload).toBe('test message');

    unsub(); // cleanup
  });

  test('onIngress unsubscribe works', async () => {
    const received: ChannelIngressEvent[] = [];
    const unsub = onIngress((evt) => { received.push(evt); });
    unsub();

    await handleInbound({
      channelId: 'feishu',
      channelAccountId: 'test',
      text: 'should not appear',
    });

    expect(received.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// B3.3: Outbound Bridge
// ---------------------------------------------------------------------------

describe('Outbound Bridge', () => {
  test('handleOutbound returns error when channel not registered', async () => {
    const result = await handleOutbound({
      channelId: 'nonexistent',
      channelAccountId: 'a1',
      externalThreadId: 't1',
      messageType: 'text',
      payload: 'hello',
      metadata: {},
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No channel runtime found');
  });

  test('handleOutbound dispatches to plugin with outbound.send()', async () => {
    const sentMessages: any[] = [];

    // Register a mock channel plugin
    registerChannel('test-plugin', 'Test Plugin', 'test-outbound', {
      id: 'test-outbound',
      outbound: {
        send: async (target: string, payload: unknown, opts: unknown) => {
          sentMessages.push({ target, payload, opts });
          return { messageId: 'msg-001' };
        },
      },
    }, '/tmp', 'full');

    const result = await handleOutbound({
      channelId: 'test-outbound',
      channelAccountId: 'acct-1',
      externalThreadId: 'thread-x',
      messageType: 'text',
      payload: 'Hello from ai-bot',
      metadata: { urgent: true },
    });

    expect(result.success).toBe(true);
    expect(result.externalMessageId).toBe('msg-001');
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].target).toBe('thread-x');
    expect(sentMessages[0].payload).toBe('Hello from ai-bot');
  });

  test('sendTextMessage convenience function works', async () => {
    const result = await sendTextMessage(
      'test-outbound', 'acct-1', 'thread-y', 'Quick message'
    );
    expect(result.success).toBe(true);
  });

  test('handleOutbound catches plugin send errors', async () => {
    registerChannel('test-plugin', 'Test Plugin', 'test-error-ch', {
      id: 'test-error-ch',
      outbound: {
        send: async () => { throw new Error('Network timeout'); },
      },
    }, '/tmp', 'full');

    const result = await handleOutbound({
      channelId: 'test-error-ch',
      channelAccountId: 'a1',
      externalThreadId: 't1',
      messageType: 'text',
      payload: 'will fail',
      metadata: {},
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Network timeout');
  });
});

// ---------------------------------------------------------------------------
// B3.4: Channel Account Control Plane
// ---------------------------------------------------------------------------

describe('Channel Account Control Plane', () => {
  let accountId: string;

  test('createAccount succeeds', async () => {
    const account = await createAccount({
      channelId: 'whatsapp',
      pluginId: 'whatsapp',
      config: { phone: '+1234567890' },
    });
    expect(account.id).toBeDefined();
    expect(account.channelId).toBe('whatsapp');
    expect(account.status).toBe('created');
    expect(account.config.phone).toBe('+1234567890');
    accountId = account.id;
  });

  test('getAccount returns created account', async () => {
    const account = await getAccount(accountId);
    expect(account).not.toBeNull();
    expect(account!.pluginId).toBe('whatsapp');
  });

  test('listAccountsByChannel returns accounts', async () => {
    const accounts = await listAccountsByChannel('whatsapp');
    expect(accounts.length).toBeGreaterThanOrEqual(1);
    expect(accounts.some(a => a.id === accountId)).toBe(true);
  });

  test('loginAccount updates status to active', async () => {
    // Register a mock channel so login can find it
    registerChannel('whatsapp', 'WhatsApp', 'whatsapp', {
      id: 'whatsapp',
      setup: {
        login: async () => {},
      },
    }, '/tmp', 'full');

    const result = await loginAccount(accountId);
    expect(result.success).toBe(true);

    const account = await getAccount(accountId);
    expect(account!.status).toBe('active');
  });

  test('getAccountStatus returns status', async () => {
    const status = await getAccountStatus(accountId);
    expect(status).not.toBeNull();
    expect(status!.status).toBe('active');
  });

  test('logoutAccount updates status to inactive', async () => {
    const result = await logoutAccount(accountId);
    expect(result.success).toBe(true);

    const account = await getAccount(accountId);
    expect(account!.status).toBe('inactive');
  });

  test('deleteAccount removes account', async () => {
    await deleteAccount(accountId);
    const account = await getAccount(accountId);
    expect(account).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B3.5: End-to-end simulated flow (install → inbound → outbound)
// ---------------------------------------------------------------------------

describe('E2E Simulated Flow', () => {
  test('WhatsApp: simulated inbound → bridge → listener', async () => {
    const events: ChannelIngressEvent[] = [];
    const unsub = onIngress((evt) => { events.push(evt); });

    await handleInbound({
      channelId: 'whatsapp',
      channelAccountId: 'wa-acct-1',
      threadId: '1234567890@s.whatsapp.net',
      senderId: '+8613800138000',
      text: '你好，我想查询套餐',
    });

    expect(events.length).toBe(1);
    expect(events[0].channelId).toBe('whatsapp');
    expect(events[0].externalSenderId).toBe('+8613800138000');
    expect(events[0].payload).toBe('你好，我想查询套餐');

    unsub();
  });

  test('Feishu: simulated inbound → bridge → listener', async () => {
    const events: ChannelIngressEvent[] = [];
    const unsub = onIngress((evt) => { events.push(evt); });

    await handleInbound({
      channelId: 'feishu',
      channelAccountId: 'fs-acct-1',
      threadId: 'oc_abc123',
      senderId: 'ou_def456',
      text: '请帮我查一下话费',
      metadata: { eventType: 'im.message.receive_v1' },
    });

    expect(events.length).toBe(1);
    expect(events[0].channelId).toBe('feishu');
    expect(events[0].metadata.eventType).toBe('im.message.receive_v1');

    unsub();
  });

  test('LINE: simulated inbound → bridge → listener', async () => {
    const events: ChannelIngressEvent[] = [];
    const unsub = onIngress((evt) => { events.push(evt); });

    await handleInbound({
      channelId: 'line',
      channelAccountId: 'line-acct-1',
      threadId: 'C1234567890abcdef',
      senderId: 'U1234567890abcdef',
      text: 'こんにちは',
    });

    expect(events.length).toBe(1);
    expect(events[0].channelId).toBe('line');
    expect(events[0].externalSenderId).toBe('U1234567890abcdef');

    unsub();
  });

  test('Outbound: send reply via registered mock channel', async () => {
    const sentReplies: any[] = [];

    registerChannel('whatsapp', 'WhatsApp', 'whatsapp', {
      id: 'whatsapp',
      outbound: {
        send: async (target: string, payload: unknown) => {
          sentReplies.push({ target, payload });
          return { messageId: `wa-msg-${Date.now()}` };
        },
      },
    }, '/tmp', 'full');

    const result = await sendTextMessage(
      'whatsapp', 'wa-acct-1',
      '1234567890@s.whatsapp.net',
      '您的套餐是：畅享卡 129元/月',
    );

    expect(result.success).toBe(true);
    expect(result.externalMessageId).toBeDefined();
    expect(sentReplies.length).toBe(1);
    expect(sentReplies[0].payload).toContain('畅享卡');
  });
});
