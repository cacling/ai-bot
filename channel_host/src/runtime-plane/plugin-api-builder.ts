/**
 * Plugin API Builder
 *
 * Constructs the `api` object injected into plugin register() calls.
 * This is the host-side implementation of OpenClaw's plugin registration API,
 * scoped to channel plugin capabilities only.
 */

import type { PluginManifest, RuntimeLoadMode } from '../types';
import { registerChannel } from './runtime-registry';
import { emitDiagnostic } from '../control-plane/diagnostics';

// ---------------------------------------------------------------------------
// API shape that plugins expect
// ---------------------------------------------------------------------------

export interface HostPluginApi {
  /** Register a channel plugin */
  registerChannel(registration: unknown): void;
  /** Current registration mode */
  registrationMode: 'full' | 'setup-only' | 'cli-metadata';
  /** Runtime context (placeholder for SDK compat layer to populate) */
  runtime: HostPluginRuntime;
  /** Plugin config (placeholder) */
  config: Record<string, unknown>;
}

export interface HostPluginRuntime {
  /** Plugin data directory */
  dataDir: string;
  /** Plugin temp directory */
  tmpDir: string;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildPluginApi(
  pluginId: string,
  manifest: PluginManifest,
  mode: RuntimeLoadMode,
): HostPluginApi {
  const registrationMode: 'full' | 'setup-only' | 'cli-metadata' =
    mode === 'full' ? 'full' : 'setup-only';

  const api: HostPluginApi = {
    registrationMode,

    registerChannel(registration: unknown) {
      // Extract the ChannelPlugin from registration
      // OpenClaw plugins pass either { plugin: ChannelPlugin } or ChannelPlugin directly
      const plugin = isRegistrationWrapper(registration)
        ? registration.plugin
        : registration;

      const channelId = extractChannelId(plugin) ?? manifest.channels[0] ?? pluginId;

      registerChannel(pluginId, manifest.name, channelId, plugin, '', mode);

      emitDiagnostic(pluginId, 'info', 'runtime',
        `Channel '${channelId}' registered by plugin '${pluginId}' (mode: ${mode})`);
    },

    runtime: {
      dataDir: `./data/plugins/${pluginId}`,
      tmpDir: `./data/plugins/${pluginId}/tmp`,
    },

    config: {},
  };

  return api;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRegistrationWrapper(obj: unknown): obj is { plugin: unknown } {
  return typeof obj === 'object' && obj !== null && 'plugin' in obj;
}

function extractChannelId(plugin: unknown): string | undefined {
  if (typeof plugin !== 'object' || plugin === null) return undefined;
  const p = plugin as Record<string, unknown>;
  if (typeof p.id === 'string') return p.id;
  return undefined;
}
