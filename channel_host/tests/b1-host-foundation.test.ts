/**
 * Phase B1 Tests: Host Foundation
 *
 * Validates: install, discover, manifest parsing, compatibility check,
 * registry operations, and diagnostics.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { resolve } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';

// DB setup — use a test-specific DB
process.env.CHANNEL_HOST_DB_PATH = './data/test-channel-host.db';

import { migrateDb } from '../src/db';
import { installPlugin, uninstallPlugin, listInstalledPlugins } from '../src/package-plane/plugin-package-manager';
import { discoverPluginAt, discoverAllPlugins } from '../src/package-plane/manifest-discovery';
import { checkPluginCompatibility } from '../src/package-plane/compatibility-governor';
import {
  registerChannel, getChannel, listChannels,
  listChannelSetups, getRegistry, resetRegistry,
} from '../src/runtime-plane/runtime-registry';
import { getPluginDiagnostics } from '../src/control-plane/diagnostics';

const OPENCLAW_EXTENSIONS = resolve(import.meta.dir, '../../openclaw-code/extensions');
const WHATSAPP_DIR = resolve(OPENCLAW_EXTENSIONS, 'whatsapp');
const FEISHU_DIR = resolve(OPENCLAW_EXTENSIONS, 'feishu');

beforeAll(() => {
  // Ensure data dir exists
  if (!existsSync('./data')) mkdirSync('./data', { recursive: true });
  migrateDb();
});

afterAll(() => {
  // Cleanup test DB
  try { rmSync('./data/test-channel-host.db', { force: true }); } catch {}
  try { rmSync('./data/test-channel-host.db-wal', { force: true }); } catch {}
  try { rmSync('./data/test-channel-host.db-shm', { force: true }); } catch {}
});

// ---------------------------------------------------------------------------
// Manifest Discovery
// ---------------------------------------------------------------------------

describe('Manifest Discovery', () => {
  test('discovers WhatsApp plugin manifest', async () => {
    const metadata = await discoverPluginAt(WHATSAPP_DIR);
    expect(metadata).not.toBeNull();
    expect(metadata!.manifest.id).toBe('whatsapp');
    expect(metadata!.manifest.channels).toContain('whatsapp');
    expect(metadata!.packageName).toBe('@openclaw/whatsapp');
    expect(metadata!.openclawFields.setupEntry).toBeDefined();
    expect(metadata!.openclawFields.extensions).toBeDefined();
  });

  test('discovers Feishu plugin manifest', async () => {
    const metadata = await discoverPluginAt(FEISHU_DIR);
    expect(metadata).not.toBeNull();
    expect(metadata!.manifest.id).toBe('feishu');
    expect(metadata!.manifest.channels).toContain('feishu');
  });

  test('returns null for non-existent directory', async () => {
    const metadata = await discoverPluginAt('/tmp/nonexistent-plugin-xyz');
    expect(metadata).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Compatibility Governor
// ---------------------------------------------------------------------------

describe('Compatibility Governor', () => {
  test('checks WhatsApp plugin compatibility', async () => {
    const metadata = await discoverPluginAt(WHATSAPP_DIR);
    expect(metadata).not.toBeNull();

    const report = await checkPluginCompatibility(metadata!);
    expect(report.pluginId).toBe('whatsapp');
    expect(['compatible', 'partial', 'incompatible']).toContain(report.status);
    expect(Array.isArray(report.missingSurfaces)).toBe(true);
    expect(Array.isArray(report.warnings)).toBe(true);
    expect(report.checkedAt).toBeGreaterThan(0);
  });

  test('Feishu plugin declares channels and passes compatibility check', async () => {
    const metadata = await discoverPluginAt(FEISHU_DIR);
    expect(metadata).not.toBeNull();

    const report = await checkPluginCompatibility(metadata!);
    // Feishu is a channel plugin — all its SDK surfaces are now implemented (B2+B3).
    expect(report.pluginId).toBe('feishu');
    expect(report.status).toBe('compatible');
    expect(report.missingSurfaces.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Plugin Package Manager
// ---------------------------------------------------------------------------

describe('Plugin Package Manager', () => {
  test('installs WhatsApp plugin from local path', async () => {
    const result = await installPlugin({ source: WHATSAPP_DIR });
    expect(result.success).toBe(true);
    expect(result.pluginId).toBe('whatsapp');
  });

  test('rejects duplicate install', async () => {
    const result = await installPlugin({ source: WHATSAPP_DIR });
    expect(result.success).toBe(false);
    expect(result.error).toContain('already installed');
  });

  test('lists installed plugins', async () => {
    const items = await listInstalledPlugins();
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some(p => p.id === 'whatsapp')).toBe(true);
  });

  test('uninstalls plugin', async () => {
    const result = await uninstallPlugin('whatsapp');
    expect(result.success).toBe(true);

    // Verify it's no longer in the installed list
    const items = await listInstalledPlugins();
    expect(items.some(p => p.id === 'whatsapp')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Runtime Registry
// ---------------------------------------------------------------------------

describe('Runtime Registry', () => {
  beforeAll(() => {
    resetRegistry();
  });

  test('registers and retrieves a channel', () => {
    const mockPlugin = { id: 'whatsapp', meta: { order: 1 } };
    registerChannel('whatsapp', '@openclaw/whatsapp', 'whatsapp', mockPlugin, '/plugins/whatsapp');

    const channel = getChannel('whatsapp');
    expect(channel).toBeDefined();
    expect(channel!.channelId).toBe('whatsapp');
    expect(channel!.pluginId).toBe('whatsapp');
  });

  test('lists all registered channels', () => {
    const channels = listChannels();
    expect(channels.length).toBeGreaterThanOrEqual(1);
  });

  test('also registers channel setup', () => {
    const setups = listChannelSetups();
    expect(setups.length).toBeGreaterThanOrEqual(1);
    expect(setups.some(s => s.channelId === 'whatsapp')).toBe(true);
  });

  test('registry version increments on registration', () => {
    const v1 = getRegistry().version;
    registerChannel('feishu', '@openclaw/feishu', 'feishu', { id: 'feishu' }, '/plugins/feishu');
    const v2 = getRegistry().version;
    expect(v2).toBeGreaterThan(v1);
  });
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

describe('Diagnostics', () => {
  test('records and retrieves diagnostics', async () => {
    // Install triggers diagnostics
    await installPlugin({ source: FEISHU_DIR });
    const items = await getPluginDiagnostics('feishu');
    expect(items.length).toBeGreaterThanOrEqual(1);

    // Cleanup
    await uninstallPlugin('feishu');
  });
});
