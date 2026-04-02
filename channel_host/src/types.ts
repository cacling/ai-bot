/**
 * Shared types for the OpenClaw Compatible Channel Plugin Host.
 *
 * These types define the host's internal object model. They are NOT the same
 * as the OpenClaw plugin-sdk types — the SDK compatibility layer maps between
 * the two worlds.
 */

// ---------------------------------------------------------------------------
// Plugin & Manifest
// ---------------------------------------------------------------------------

export interface PluginManifest {
  /** Plugin id from openclaw.plugin.json */
  id: string;
  /** Human-readable name (from package.json or manifest) */
  name: string;
  /** Channel ids this plugin registers */
  channels: string[];
  /** Path to the setupEntry module (relative to plugin root) */
  setupEntry?: string;
  /** Path to the extensions module (relative to plugin root) */
  extensions?: string;
  /** JSON Schema for plugin config */
  configSchema?: Record<string, unknown>;
  /** Skills directory (optional, e.g. feishu) */
  skills?: string[];
  /** Raw openclaw.plugin.json content */
  raw: Record<string, unknown>;
}

export interface PluginPackageMetadata {
  /** Plugin root directory (absolute path) */
  rootDir: string;
  /** package.json name */
  packageName: string;
  /** package.json version */
  packageVersion: string;
  /** Parsed manifest */
  manifest: PluginManifest;
  /** OpenClaw-specific fields from package.json */
  openclawFields: {
    extensions?: string;
    setupEntry?: string;
    channel?: Record<string, unknown>;
    install?: Record<string, unknown>;
  };
}

export type InstallStatus = 'installed' | 'failed' | 'uninstalled';
export type EnablementState = 'enabled' | 'disabled';
export type ChannelAccountStatus = 'created' | 'active' | 'inactive' | 'error';
export type DiagnosticLevel = 'info' | 'warn' | 'error';
export type DiagnosticCategory =
  | 'install'
  | 'manifest'
  | 'compatibility'
  | 'runtime'
  | 'inbound'
  | 'outbound';

export type RuntimeLoadMode = 'setup-only' | 'setup-runtime' | 'full';

// ---------------------------------------------------------------------------
// Compatibility
// ---------------------------------------------------------------------------

export type CompatibilityStatus = 'compatible' | 'partial' | 'incompatible';

export interface CompatibilityReport {
  pluginId: string;
  status: CompatibilityStatus;
  /** SDK surfaces required by the plugin but not yet implemented in host */
  missingSurfaces: string[];
  /** Non-blocking issues */
  warnings: string[];
  /** Timestamp of the check */
  checkedAt: number;
}

// ---------------------------------------------------------------------------
// Runtime Registry (in-memory)
// ---------------------------------------------------------------------------

export interface RegisteredPlugin {
  id: string;
  name: string;
  rootDir: string;
  manifest: PluginManifest;
  enabled: boolean;
}

export interface RegisteredChannel {
  pluginId: string;
  pluginName: string;
  channelId: string;
  /** The ChannelPlugin object from the plugin (opaque to host core) */
  plugin: unknown;
  rootDir: string;
}

export interface RegisteredChannelSetup {
  pluginId: string;
  pluginName: string;
  channelId: string;
  /** The ChannelPlugin object (setup surface only) */
  plugin: unknown;
  rootDir: string;
  enabled: boolean;
}

export interface RuntimeRegistry {
  plugins: RegisteredPlugin[];
  channels: RegisteredChannel[];
  channelSetups: RegisteredChannelSetup[];
  version: number;
}

// ---------------------------------------------------------------------------
// Bridge Events
// ---------------------------------------------------------------------------

export interface ChannelIngressEvent {
  channelId: string;
  channelAccountId: string;
  externalThreadId: string;
  externalSenderId: string;
  messageType: 'text' | 'media' | 'action';
  payload: unknown;
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface OutboundCommand {
  channelId: string;
  channelAccountId: string;
  externalThreadId: string;
  messageType: 'text' | 'media' | 'action';
  payload: unknown;
  metadata: Record<string, unknown>;
}

export interface SendResult {
  success: boolean;
  channelId: string;
  externalMessageId?: string;
  error?: string;
  raw?: unknown;
}
