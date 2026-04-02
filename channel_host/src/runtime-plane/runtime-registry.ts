/**
 * Runtime Registry
 *
 * In-memory registry holding all loaded plugins, channels, and channel setups.
 * This is the central lookup for control-plane and data-plane operations.
 */

import type {
  RegisteredPlugin,
  RegisteredChannel,
  RegisteredChannelSetup,
  RuntimeRegistry,
  RuntimeLoadMode,
} from '../types';

// ---------------------------------------------------------------------------
// Singleton registry
// ---------------------------------------------------------------------------

let registry: RuntimeRegistry = createEmptyRegistry();

function createEmptyRegistry(): RuntimeRegistry {
  return {
    plugins: [],
    channels: [],
    channelSetups: [],
    version: 0,
  };
}

export function getRegistry(): Readonly<RuntimeRegistry> {
  return registry;
}

export function resetRegistry(): void {
  registry = createEmptyRegistry();
}

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

export function registerPlugin(plugin: RegisteredPlugin): void {
  const existing = registry.plugins.findIndex(p => p.id === plugin.id);
  if (existing >= 0) {
    registry.plugins[existing] = plugin;
  } else {
    registry.plugins.push(plugin);
  }
  registry.version++;
}

export function getPlugin(id: string): RegisteredPlugin | undefined {
  return registry.plugins.find(p => p.id === id);
}

export function listPlugins(): readonly RegisteredPlugin[] {
  return registry.plugins;
}

// ---------------------------------------------------------------------------
// Channel registration
// ---------------------------------------------------------------------------

export function registerChannel(
  pluginId: string,
  pluginName: string,
  channelId: string,
  channelPlugin: unknown,
  rootDir: string,
  mode: RuntimeLoadMode = 'full',
): void {
  // Always register in channelSetups (for setup surface discovery)
  const existingSetup = registry.channelSetups.findIndex(
    s => s.pluginId === pluginId && s.channelId === channelId,
  );
  const setupEntry: RegisteredChannelSetup = {
    pluginId,
    pluginName,
    channelId,
    plugin: channelPlugin,
    rootDir,
    enabled: true,
  };
  if (existingSetup >= 0) {
    registry.channelSetups[existingSetup] = setupEntry;
  } else {
    registry.channelSetups.push(setupEntry);
  }

  // Register in full channels only if not setup-only mode
  if (mode !== 'setup-only') {
    const existingChannel = registry.channels.findIndex(
      c => c.pluginId === pluginId && c.channelId === channelId,
    );
    const channelEntry: RegisteredChannel = {
      pluginId,
      pluginName,
      channelId,
      plugin: channelPlugin,
      rootDir,
    };
    if (existingChannel >= 0) {
      registry.channels[existingChannel] = channelEntry;
    } else {
      registry.channels.push(channelEntry);
    }
  }

  registry.version++;
}

export function getChannel(channelId: string): RegisteredChannel | undefined {
  return registry.channels.find(c => c.channelId === channelId);
}

export function listChannels(): readonly RegisteredChannel[] {
  return registry.channels;
}

export function getChannelSetup(channelId: string): RegisteredChannelSetup | undefined {
  return registry.channelSetups.find(s => s.channelId === channelId);
}

export function listChannelSetups(): readonly RegisteredChannelSetup[] {
  return registry.channelSetups;
}
