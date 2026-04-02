/**
 * Phase B5 Tests: Real Plugin Loading
 *
 * Validates: Actual OpenClaw plugin entry points can be dynamically imported
 * through our SDK compat layer, and their register() method runs successfully
 * with our host's Plugin API.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { resolve } from 'path';

// Load the SDK compat layer FIRST
import '../src/runtime-plane/sdk-compat/_loader';

// DB setup
process.env.CHANNEL_HOST_DB_PATH = './data/test-b5.db';
import { migrateDb } from '../src/db';
import { resetRegistry, listChannels, listChannelSetups } from '../src/runtime-plane/runtime-registry';
import { buildPluginApi } from '../src/runtime-plane/plugin-api-builder';

const OPENCLAW_EXTENSIONS = resolve(import.meta.dir, '../../openclaw-code/extensions');

beforeAll(() => {
  const { mkdirSync, existsSync } = require('fs');
  if (!existsSync('./data')) mkdirSync('./data', { recursive: true });
  migrateDb();
  resetRegistry();
});

// ---------------------------------------------------------------------------
// Helper: try loading a real plugin
// ---------------------------------------------------------------------------

interface LoadResult {
  imported: boolean;
  importError?: string;
  hasEntry: boolean;
  entryId?: string;
  registered: boolean;
  registerError?: string;
  channelRegistered: boolean;
}

async function tryLoadRealPlugin(pluginDir: string, pluginId: string, mode: 'setup-only' | 'full' = 'setup-only'): Promise<LoadResult> {
  const result: LoadResult = {
    imported: false,
    hasEntry: false,
    registered: false,
    channelRegistered: false,
  };

  // Step 1: Dynamic import
  let entryModule: any;
  try {
    const entryPath = resolve(pluginDir, 'index.ts');
    entryModule = await import(entryPath);
    result.imported = true;
  } catch (err) {
    result.importError = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.stack) {
      console.error(`[B5] Import stack for ${pluginId}:`, err.stack.split('\n').slice(0, 10).join('\n'));
    }
    return result;
  }

  // Step 2: Check for default export (defineChannelPluginEntry result)
  const entry = entryModule.default;
  if (!entry || typeof entry.register !== 'function') {
    result.hasEntry = false;
    return result;
  }
  result.hasEntry = true;
  result.entryId = entry.id;

  // Step 3: Call register() with our host's Plugin API
  try {
    const manifest = {
      id: pluginId,
      name: entry.name ?? pluginId,
      channels: [pluginId],
      raw: {},
    };
    const api = buildPluginApi(pluginId, manifest, mode);
    entry.register(api);
    result.registered = true;

    // Check if channel was registered in our registry
    const channels = listChannels();
    result.channelRegistered = channels.some(c => c.channelId === pluginId);
  } catch (err) {
    result.registerError = err instanceof Error
      ? `${err.name}: ${err.message}`
      : String(err);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Real Plugin Dynamic Import', () => {
  test('WhatsApp plugin entry imports successfully', async () => {
    const result = await tryLoadRealPlugin(
      resolve(OPENCLAW_EXTENSIONS, 'whatsapp'), 'whatsapp', 'setup-only'
    );
    console.log('[B5] WhatsApp:', JSON.stringify(result, null, 2));
    expect(result.imported).toBe(true);
  }, 30_000);

  test('Feishu plugin entry imports successfully', async () => {
    const result = await tryLoadRealPlugin(
      resolve(OPENCLAW_EXTENSIONS, 'feishu'), 'feishu', 'setup-only'
    );
    console.log('[B5] Feishu:', JSON.stringify(result, null, 2));
    expect(result.imported).toBe(true);
  }, 30_000);

  test('LINE plugin entry imports successfully', async () => {
    const result = await tryLoadRealPlugin(
      resolve(OPENCLAW_EXTENSIONS, 'line'), 'line', 'setup-only'
    );
    console.log('[B5] LINE:', JSON.stringify(result, null, 2));
    expect(result.imported).toBe(true);
  }, 30_000);

  test('Telegram plugin entry imports successfully', async () => {
    const result = await tryLoadRealPlugin(
      resolve(OPENCLAW_EXTENSIONS, 'telegram'), 'telegram', 'setup-only'
    );
    console.log('[B5] Telegram:', JSON.stringify(result, null, 2));
    expect(result.imported).toBe(true);
  }, 30_000);
});

describe('Real Plugin Registration (setup-only mode)', () => {
  test('WhatsApp entry has valid register()', async () => {
    const result = await tryLoadRealPlugin(
      resolve(OPENCLAW_EXTENSIONS, 'whatsapp'), 'whatsapp', 'setup-only'
    );
    expect(result.hasEntry).toBe(true);
    expect(result.entryId).toBe('whatsapp');
    expect(result.registered).toBe(true);
  }, 30_000);

  test('Feishu entry has valid register()', async () => {
    const result = await tryLoadRealPlugin(
      resolve(OPENCLAW_EXTENSIONS, 'feishu'), 'feishu', 'setup-only'
    );
    expect(result.hasEntry).toBe(true);
    expect(result.entryId).toBe('feishu');
    expect(result.registered).toBe(true);
  }, 30_000);

  test('LINE entry has valid register()', async () => {
    const result = await tryLoadRealPlugin(
      resolve(OPENCLAW_EXTENSIONS, 'line'), 'line', 'setup-only'
    );
    expect(result.hasEntry).toBe(true);
    expect(result.entryId).toBe('line');
    expect(result.registered).toBe(true);
  }, 30_000);

  test('Telegram entry has valid register()', async () => {
    const result = await tryLoadRealPlugin(
      resolve(OPENCLAW_EXTENSIONS, 'telegram'), 'telegram', 'setup-only'
    );
    expect(result.hasEntry).toBe(true);
    expect(result.entryId).toBe('telegram');
    expect(result.registered).toBe(true);
  }, 30_000);
});
