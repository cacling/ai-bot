/**
 * Runtime Loader
 *
 * Loads plugin modules in one of three modes:
 * - setup-only: only load setupEntry for account setup/login/status
 * - setup-runtime: load setupEntry + provide runtime context
 * - full: load extensions entry for complete channel runtime
 *
 * Uses Bun dynamic import with SDK compatibility layer module aliasing.
 */

import { resolve, join } from 'path';
import type { PluginPackageMetadata, RuntimeLoadMode } from '../types';
import { registerChannel, registerPlugin } from './runtime-registry';
import { buildPluginApi } from './plugin-api-builder';
import { emitDiagnostic } from '../control-plane/diagnostics';

// ---------------------------------------------------------------------------
// Runtime instance tracking
// ---------------------------------------------------------------------------

interface RuntimeInstance {
  pluginId: string;
  mode: RuntimeLoadMode;
  entry: unknown;
  loadedAt: number;
}

const instances = new Map<string, RuntimeInstance>();

export function getRuntimeInstance(pluginId: string): RuntimeInstance | undefined {
  return instances.get(pluginId);
}

export function listRuntimeInstances(): RuntimeInstance[] {
  return Array.from(instances.values());
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export async function loadPlugin(
  metadata: PluginPackageMetadata,
  mode: RuntimeLoadMode = 'full',
): Promise<{ success: boolean; error?: string }> {
  const { manifest, rootDir } = metadata;
  const pluginId = manifest.id;

  // Register plugin in registry
  registerPlugin({
    id: pluginId,
    name: manifest.name,
    rootDir,
    manifest,
    enabled: true,
  });

  try {
    let entryPath: string | undefined;

    if (mode === 'setup-only' || mode === 'setup-runtime') {
      // Prefer setupEntry for setup modes
      entryPath = manifest.setupEntry
        ? resolve(rootDir, manifest.setupEntry)
        : manifest.extensions
          ? resolve(rootDir, manifest.extensions)
          : undefined;
    } else {
      // Full mode: use extensions entry
      entryPath = manifest.extensions
        ? resolve(rootDir, manifest.extensions)
        : undefined;
    }

    if (!entryPath) {
      const msg = `No entry point found for plugin '${pluginId}' in mode '${mode}'`;
      await emitDiagnostic(pluginId, 'error', 'runtime', msg);
      return { success: false, error: msg };
    }

    // Dynamic import of the plugin entry module
    // The SDK compatibility layer (Bun.plugin or tsconfig paths) handles
    // resolving openclaw/plugin-sdk/* imports to our compat implementations
    const mod = await import(entryPath);
    const entry = mod.default ?? mod;

    // The entry should have a register() function (from defineChannelPluginEntry)
    if (typeof entry?.register !== 'function') {
      const msg = `Plugin '${pluginId}' entry does not export a register() function`;
      await emitDiagnostic(pluginId, 'warn', 'runtime', msg);
      // Still track as loaded — some plugins have different shapes
    }

    // Build the host API to inject into the plugin
    const api = buildPluginApi(pluginId, manifest, mode);

    // Call register if available
    if (typeof entry?.register === 'function') {
      await entry.register(api);
    }

    // Track runtime instance
    instances.set(pluginId, {
      pluginId,
      mode,
      entry,
      loadedAt: Date.now(),
    });

    await emitDiagnostic(pluginId, 'info', 'runtime',
      `Plugin '${pluginId}' loaded in '${mode}' mode`);

    return { success: true };
  } catch (err) {
    const msg = `Failed to load plugin '${pluginId}': ${err}`;
    await emitDiagnostic(pluginId, 'error', 'runtime', msg);
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Unload
// ---------------------------------------------------------------------------

export async function unloadPlugin(pluginId: string): Promise<void> {
  instances.delete(pluginId);
  await emitDiagnostic(pluginId, 'info', 'runtime', `Plugin '${pluginId}' unloaded`);
}
