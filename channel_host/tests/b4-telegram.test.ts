/**
 * Phase B4 Tests: Telegram Compatibility
 *
 * Validates: Telegram L2 surfaces import correctly, Telegram plugin
 * passes compatibility check, and E2E inbound/outbound flow works.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { resolve } from 'path';

// Load SDK compat layer
import '../src/runtime-plane/sdk-compat/_loader';

// DB setup
process.env.CHANNEL_HOST_DB_PATH = './data/test-b4.db';
import { migrateDb } from '../src/db';
import { discoverPluginAt } from '../src/package-plane/manifest-discovery';
import { checkPluginCompatibility } from '../src/package-plane/compatibility-governor';
import { registerChannel, resetRegistry } from '../src/runtime-plane/runtime-registry';
import { handleInbound, onIngress } from '../src/bridge-plane/inbound-bridge';
import { sendTextMessage } from '../src/bridge-plane/outbound-bridge';
import type { ChannelIngressEvent } from '../src/types';

const OPENCLAW_EXTENSIONS = resolve(import.meta.dir, '../../openclaw-code/extensions');

beforeAll(() => {
  const { mkdirSync, existsSync } = require('fs');
  if (!existsSync('./data')) mkdirSync('./data', { recursive: true });
  migrateDb();
  resetRegistry();
});

// ---------------------------------------------------------------------------
// B4.1: Telegram L2 Surface Imports
// ---------------------------------------------------------------------------

describe('Telegram L2 Surface Imports', () => {
  test('telegram-core imports', async () => {
    const tc = await import('openclaw/plugin-sdk/telegram-core');
    expect(tc.DEFAULT_ACCOUNT_ID).toBe('default');
    expect(tc.getChatChannelMeta).toBeFunction();
    expect(tc.buildChannelConfigSchema).toBeFunction();
    expect(tc.parseTelegramTopicConversation).toBeFunction();
    expect(tc.buildTokenChannelStatusSummary).toBeFunction();
    expect(tc.PAIRING_APPROVED_MESSAGE).toBeDefined();
    expect(tc.readStringParam).toBeFunction();
    expect(tc.readReactionParams).toBeFunction();
    expect(tc.TelegramConfigSchema).toBeDefined();
  });

  test('acp-runtime imports', async () => {
    const acp = await import('openclaw/plugin-sdk/acp-runtime');
    expect(acp.AcpRuntimeError).toBeDefined();
    expect(acp.isAcpRuntimeError).toBeFunction();
    expect(acp.getAcpRuntimeBackend).toBeFunction();
    expect(acp.registerAcpRuntimeBackend).toBeFunction();
    expect(acp.readAcpSessionEntry).toBeFunction();
  });

  test('boolean-param imports', async () => {
    const bp = await import('openclaw/plugin-sdk/boolean-param');
    expect(bp.readBooleanParam({ verbose: 'true' }, 'verbose')).toBe(true);
    expect(bp.readBooleanParam({ verbose: 'false' }, 'verbose')).toBe(false);
    expect(bp.readBooleanParam({}, 'verbose', true)).toBe(true);
  });

  test('channel-lifecycle imports', async () => {
    const cl = await import('openclaw/plugin-sdk/channel-lifecycle');
    expect(cl.createChannelLifecycleMachine).toBeFunction();
    expect(cl.createDraftStreamControls).toBeFunction();
    expect(cl.createStallWatchdog).toBeFunction();
  });

  test('command-auth-native imports', async () => {
    const can = await import('openclaw/plugin-sdk/command-auth-native');
    expect(can.parseCommandArgs).toBeFunction();
    const parsed = can.parseCommandArgs('/start arg1 arg2');
    expect(parsed.command).toBe('start');
    expect(parsed.args).toEqual(['arg1', 'arg2']);
  });

  test('diagnostic-runtime imports', async () => {
    const dr = await import('openclaw/plugin-sdk/diagnostic-runtime');
    expect(dr.isDiagnosticsEnabled).toBeFunction();
    expect(dr.isDiagnosticFlagEnabled).toBeFunction();
  });

  test('error-runtime imports', async () => {
    const er = await import('openclaw/plugin-sdk/error-runtime');
    expect(er.formatErrorMessage(new Error('test'))).toBe('test');
    expect(er.extractErrorCode({ code: 'ENOENT' })).toBe('ENOENT');
  });

  test('hook-runtime imports', async () => {
    const hr = await import('openclaw/plugin-sdk/hook-runtime');
    expect(hr.createHookRunner).toBeFunction();
    expect(hr.fireAndForget).toBeFunction();
  });

  test('infra-runtime imports', async () => {
    const ir = await import('openclaw/plugin-sdk/infra-runtime');
    expect(ir.parseExecApprovalCommandText).toBeFunction();
    expect(ir.exponentialBackoff).toBeFunction();
    expect(ir.formatDuration(1500)).toBe('1.5s');
    expect(ir.formatDuration(500)).toBe('500ms');
    expect(ir.createDedupeCache).toBeFunction();
    expect(ir.createRuntimeOutboundDelegates).toBeFunction();
  });

  test('interactive-runtime imports', async () => {
    const ir = await import('openclaw/plugin-sdk/interactive-runtime');
    expect(ir.resolveInteractiveTextFallback).toBeFunction();
    expect(ir.hasInteractiveReplyBlocks).toBeFunction();
    const reply = { blocks: [{ type: 'text' as const, content: 'hello' }] };
    expect(ir.reduceInteractiveReply(reply)).toBe('hello');
  });

  test('json-store imports', async () => {
    const js = await import('openclaw/plugin-sdk/json-store');
    expect(js.loadJsonFile).toBeFunction();
    expect(js.saveJsonFile).toBeFunction();
    expect(js.writeJsonFileAtomically).toBeFunction();
    // Test fallback
    expect(js.loadJsonFile('/nonexistent/path.json', { default: true })).toEqual({ default: true });
  });

  test('media-understanding-runtime imports', async () => {
    const mu = await import('openclaw/plugin-sdk/media-understanding-runtime');
    expect(mu.describeImageFile).toBeFunction();
    expect(mu.transcribeAudioFile).toBeFunction();
    const result = await mu.describeImageFile('/tmp/test.png');
    expect(result).toContain('not available');
  });

  test('plugin-runtime imports', async () => {
    const pr = await import('openclaw/plugin-sdk/plugin-runtime');
    expect(pr.dispatchPluginInteractiveHandler).toBeFunction();
    expect(pr.createLazyServiceModule).toBeFunction();
    expect(pr.resolvePluginHttpPath('telegram', '/webhook')).toBe('/plugins/telegram/webhook');
  });

  test('provider-auth imports', async () => {
    const pa = await import('openclaw/plugin-sdk/provider-auth');
    expect(pa.CLAUDE_CLI_PROFILE_ID).toBe('claude-cli');
    expect(pa.formatApiKeyPreview).toBeFunction();
    expect(pa.formatApiKeyPreview('sk-1234567890abcdef')).toBe('sk-1...cdef');
    expect(pa.validateApiKeyInput).toBeFunction();
    expect(pa.generatePkceVerifierChallenge).toBeFunction();
  });

  test('reply-dispatch-runtime imports', async () => {
    const rd = await import('openclaw/plugin-sdk/reply-dispatch-runtime');
    expect(rd.resolveChunkMode).toBeFunction();
    expect(rd.dispatchReplyWithDispatcher).toBeFunction();
  });

  test('retry-runtime imports', async () => {
    const rr = await import('openclaw/plugin-sdk/retry-runtime');
    expect(rr.TELEGRAM_RETRY_DEFAULTS).toBeDefined();
    expect(rr.TELEGRAM_RETRY_DEFAULTS.maxAttempts).toBe(3);
    expect(rr.createTelegramRetryRunner).toBeFunction();
    expect(rr.retryAsync).toBeFunction();
  });

  test('tool-send imports', async () => {
    const ts = await import('openclaw/plugin-sdk/tool-send');
    expect(ts.extractToolSend).toBeFunction();
    expect(ts.extractToolSend(null)).toBeNull();
    expect(ts.extractToolSend({ channelId: 'tg', target: '123', payload: 'hi' }))
      .toEqual({ channelId: 'tg', target: '123', payload: 'hi' });
  });
});

// ---------------------------------------------------------------------------
// B4.2: Telegram Plugin Compatibility
// ---------------------------------------------------------------------------

describe('Telegram Plugin Compatibility', () => {
  test('Telegram plugin discovered and passes compatibility check', async () => {
    const tgDir = resolve(OPENCLAW_EXTENSIONS, 'telegram');
    const meta = await discoverPluginAt(tgDir);
    expect(meta).not.toBeNull();
    expect(meta!.manifest.id).toBe('telegram');
    expect(meta!.manifest.channels).toContain('telegram');

    const report = await checkPluginCompatibility(meta!);
    // With all L2 surfaces, Telegram should be compatible or have very few missing
    expect(report.missingSurfaces.length).toBeLessThanOrEqual(5);
    // Even if a few niche surfaces are missing, status should not be incompatible
    expect(report.status).not.toBe('incompatible');
  });

  test('SDK compat now has 74+ surfaces', async () => {
    const { Glob } = globalThis.Bun ?? await import('bun');
    const glob = new Glob('*.ts');
    const sdkDir = resolve(import.meta.dir, '../src/runtime-plane/sdk-compat');
    let count = 0;
    for (const file of glob.scanSync({ cwd: sdkDir, onlyFiles: true })) {
      if (!file.startsWith('_')) count++;
    }
    expect(count).toBeGreaterThanOrEqual(74);
  });
});

// ---------------------------------------------------------------------------
// B4.3: Telegram E2E Simulated Flow
// ---------------------------------------------------------------------------

describe('Telegram E2E Flow', () => {
  test('Telegram inbound text message via bridge', async () => {
    const events: ChannelIngressEvent[] = [];
    const unsub = onIngress((evt) => { events.push(evt); });

    await handleInbound({
      channelId: 'telegram',
      channelAccountId: 'tg-bot-1',
      threadId: '123456789',
      senderId: '987654321',
      text: '/start',
      metadata: { updateType: 'message' },
    });

    expect(events.length).toBe(1);
    expect(events[0].channelId).toBe('telegram');
    expect(events[0].externalSenderId).toBe('987654321');
    expect(events[0].payload).toBe('/start');
    expect(events[0].metadata.updateType).toBe('message');

    unsub();
  });

  test('Telegram inbound callback query (action)', async () => {
    const events: ChannelIngressEvent[] = [];
    const unsub = onIngress((evt) => { events.push(evt); });

    await handleInbound({
      channelId: 'telegram',
      channelAccountId: 'tg-bot-1',
      threadId: '123456789',
      senderId: '987654321',
      action: { type: 'callback_query', data: 'approve_123' },
    });

    expect(events.length).toBe(1);
    expect(events[0].messageType).toBe('action');
    expect((events[0].payload as any).type).toBe('callback_query');

    unsub();
  });

  test('Telegram outbound reply via registered mock channel', async () => {
    const sentReplies: any[] = [];

    registerChannel('telegram-plugin', 'Telegram', 'telegram', {
      id: 'telegram',
      outbound: {
        send: async (target: string, payload: unknown) => {
          sentReplies.push({ target, payload });
          return { messageId: `tg-msg-${Date.now()}` };
        },
      },
    }, '/tmp', 'full');

    const result = await sendTextMessage(
      'telegram', 'tg-bot-1', '123456789',
      '欢迎使用小通智能客服！请问有什么可以帮您的？',
    );

    expect(result.success).toBe(true);
    expect(result.externalMessageId).toBeDefined();
    expect(sentReplies.length).toBe(1);
    expect(sentReplies[0].payload).toContain('小通');
  });

  test('Telegram inbound media (photo)', async () => {
    const events: ChannelIngressEvent[] = [];
    const unsub = onIngress((evt) => { events.push(evt); });

    await handleInbound({
      channelId: 'telegram',
      channelAccountId: 'tg-bot-1',
      threadId: '123456789',
      senderId: '987654321',
      media: {
        type: 'photo',
        fileId: 'AgACAgIAAxkBAAI...',
        width: 800,
        height: 600,
      },
    });

    expect(events.length).toBe(1);
    expect(events[0].messageType).toBe('media');
    expect((events[0].payload as any).type).toBe('photo');

    unsub();
  });
});

// ---------------------------------------------------------------------------
// B4.4: All Four Plugins Compatibility Summary
// ---------------------------------------------------------------------------

describe('Four-Plugin Compatibility Summary', () => {
  test('All four target plugins pass compatibility check', async () => {
    const pluginDirs = ['whatsapp', 'feishu', 'line', 'telegram'];
    const results: Record<string, { status: string; missing: number }> = {};

    for (const name of pluginDirs) {
      const dir = resolve(OPENCLAW_EXTENSIONS, name);
      const meta = await discoverPluginAt(dir);
      if (!meta) {
        results[name] = { status: 'not-found', missing: -1 };
        continue;
      }
      const report = await checkPluginCompatibility(meta);
      results[name] = { status: report.status, missing: report.missingSurfaces.length };
    }

    // All should be discoverable
    for (const name of pluginDirs) {
      expect(results[name]).toBeDefined();
      expect(results[name].status).not.toBe('not-found');
    }

    // All should be compatible or at most partial (very few missing)
    for (const name of pluginDirs) {
      expect(results[name].missing).toBeLessThanOrEqual(5);
      expect(results[name].status).not.toBe('incompatible');
    }

    // Print summary for visibility
    console.log('\n=== Four-Plugin Compatibility Summary ===');
    for (const name of pluginDirs) {
      console.log(`  ${name}: ${results[name].status} (${results[name].missing} missing)`);
    }
    console.log('=========================================\n');
  });
});
