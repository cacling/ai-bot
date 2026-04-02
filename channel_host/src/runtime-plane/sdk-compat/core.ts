/**
 * openclaw/plugin-sdk/core compatibility
 *
 * Provides: defineChannelPluginEntry, defineSetupPluginEntry,
 * createChatChannelPlugin, createChannelPluginBase, and supporting types/helpers.
 */

// ---------------------------------------------------------------------------
// Types (re-exported for plugin compatibility)
// ---------------------------------------------------------------------------

export type OpenClawConfig = Record<string, unknown>;
export type PluginRuntime = { dataDir: string; tmpDir: string };
export type PluginLogger = (...args: unknown[]) => void;
export type OpenClawPluginApi = {
  registerChannel(registration: unknown): void;
  registrationMode: 'full' | 'setup-only' | 'cli-metadata';
  runtime: PluginRuntime;
  config: OpenClawConfig;
};
export type ChannelPlugin = Record<string, unknown>;
export type ChannelConfigUiHint = Record<string, unknown>;
export type ChannelOutboundSessionRoute = { channelId: string; accountId: string; target: string };
export type ChannelOutboundSessionRouteParams = { channelId: string; accountId?: string; target?: string };
export type GatewayRequestHandlerOptions = Record<string, unknown>;
export type OpenClawPluginDefinition = Record<string, unknown>;
export type OpenClawPluginConfigSchema = Record<string, unknown>;
export type OpenClawPluginCommandDefinition = Record<string, unknown>;
export type OpenClawPluginService = Record<string, unknown>;
export type OpenClawPluginServiceContext = Record<string, unknown>;
export type PluginCommandContext = Record<string, unknown>;
export type OpenClawPluginToolContext = Record<string, unknown>;
export type OpenClawPluginToolFactory = (...args: unknown[]) => unknown;
export type AnyAgentTool = Record<string, unknown>;
export type SecretFileReadOptions = { maxBytes?: number };
export type SecretFileReadResult = { data: string; source: string };
export type GatewayBindUrlResult = { url: string };
export type ProviderAuthContext = Record<string, unknown>;
export type ProviderAuthResult = Record<string, unknown>;
export type ProviderRuntimeModel = Record<string, unknown>;
export type SpeechProviderPlugin = Record<string, unknown>;
export type MediaUnderstandingProviderPlugin = Record<string, unknown>;
export type ChannelMessagingAdapter = Record<string, unknown>;
export type ChannelMessageActionContext = Record<string, unknown>;
export type ProviderUsageSnapshot = Record<string, unknown>;
export type UsageProviderId = string;
export type UsageWindow = Record<string, unknown>;
export type PluginInteractiveTelegramHandlerContext = Record<string, unknown>;
export type ProviderAuthMethod = Record<string, unknown>;
export type ProviderAuthMethodNonInteractiveContext = Record<string, unknown>;
export type ProviderAuthDoctorHintContext = Record<string, unknown>;
export type ProviderAugmentModelCatalogContext = Record<string, unknown>;
export type ProviderBuildMissingAuthMessageContext = Record<string, unknown>;
export type ProviderBuildUnknownModelHintContext = Record<string, unknown>;
export type ProviderBuiltInModelSuppressionContext = Record<string, unknown>;
export type ProviderBuiltInModelSuppressionResult = Record<string, unknown>;
export type ProviderCacheTtlEligibilityContext = Record<string, unknown>;
export type ProviderCatalogContext = Record<string, unknown>;
export type ProviderCatalogResult = Record<string, unknown>;
export type ProviderDefaultThinkingPolicyContext = Record<string, unknown>;
export type ProviderDiscoveryContext = Record<string, unknown>;
export type ProviderFetchUsageSnapshotContext = Record<string, unknown>;
export type ProviderModernModelPolicyContext = Record<string, unknown>;
export type ProviderNormalizeResolvedModelContext = Record<string, unknown>;
export type ProviderPrepareDynamicModelContext = Record<string, unknown>;
export type ProviderPrepareExtraParamsContext = Record<string, unknown>;
export type ProviderPrepareRuntimeAuthContext = Record<string, unknown>;
export type ProviderPreparedRuntimeAuth = Record<string, unknown>;
export type ProviderResolveDynamicModelContext = Record<string, unknown>;
export type ProviderResolvedUsageAuth = Record<string, unknown>;
export type ProviderResolveUsageAuthContext = Record<string, unknown>;
export type ProviderThinkingPolicyContext = Record<string, unknown>;
export type ProviderWrapStreamFnContext = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_ACCOUNT_ID = 'default';
export const DEFAULT_SECRET_FILE_MAX_BYTES = 64 * 1024;
export const emptyPluginConfigSchema = { type: 'object' as const, properties: {} };

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

interface DefineChannelPluginEntryOptions<TPlugin = unknown> {
  id: string;
  name: string;
  description?: string;
  plugin: TPlugin;
  configSchema?: Record<string, unknown>;
  setRuntime?: (runtime: unknown) => void;
  registerCliMetadata?: (api: unknown) => void;
  registerFull?: (api: unknown) => void;
}

interface DefinedChannelPluginEntry<TPlugin = unknown> {
  id: string;
  name: string;
  description?: string;
  plugin: TPlugin;
  register: (api: OpenClawPluginApi) => void;
}

export function defineChannelPluginEntry<TPlugin = unknown>(
  opts: DefineChannelPluginEntryOptions<TPlugin>,
): DefinedChannelPluginEntry<TPlugin> {
  const { id, name, description, plugin, configSchema, setRuntime, registerCliMetadata, registerFull } = opts;

  return {
    id,
    name,
    description,
    plugin,
    register(api: OpenClawPluginApi) {
      const mode = api.registrationMode;

      if (mode === 'cli-metadata') {
        registerCliMetadata?.(api);
        return;
      }

      // Always set runtime if provided
      setRuntime?.(api.runtime);

      if (mode === 'setup-only') {
        // Only setup — don't register channel for full runtime
        return;
      }

      // Full mode: register channel + optional extras
      api.registerChannel(plugin);
      registerCliMetadata?.(api);
      registerFull?.(api);
    },
  };
}

interface DefineSetupPluginEntryOptions {
  id: string;
  name: string;
  description?: string;
  setup: (api: unknown) => void;
}

export function defineSetupPluginEntry(opts: DefineSetupPluginEntryOptions) {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    register(api: OpenClawPluginApi) {
      opts.setup(api);
    },
  };
}

export function createChatChannelPlugin(opts: Record<string, unknown>): Record<string, unknown> {
  return { ...opts };
}

export function createChannelPluginBase(opts: Record<string, unknown>): Record<string, unknown> {
  return { ...opts };
}

// ---------------------------------------------------------------------------
// Helpers used by plugins
// ---------------------------------------------------------------------------

export function generateSecureUuid(): string {
  return crypto.randomUUID();
}

export function generateSecureToken(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function createDedupeCache<K = string>() {
  const seen = new Map<K, number>();
  return {
    isDuplicate(key: K, windowMs = 5000): boolean {
      const now = Date.now();
      const last = seen.get(key);
      if (last && now - last < windowMs) return true;
      seen.set(key, now);
      return false;
    },
    clear() { seen.clear(); },
  };
}

export function resolveGlobalDedupeCache() {
  return createDedupeCache();
}

export function normalizeAccountId(id: string | undefined): string {
  return id?.trim() || DEFAULT_ACCOUNT_ID;
}

export function buildChannelConfigSchema(_channelId: string, schema?: Record<string, unknown>) {
  return schema ?? emptyPluginConfigSchema;
}

export function buildAgentSessionKey(channelId: string, accountId: string, target: string): string {
  return `${channelId}:${accountId}:${target}`;
}

export function resolveThreadSessionKeys(channelId: string, accountId: string, threadId: string) {
  return { main: buildAgentSessionKey(channelId, accountId, threadId) };
}

export function stripChannelTargetPrefix(target: string): string {
  const idx = target.indexOf(':');
  return idx >= 0 ? target.slice(idx + 1) : target;
}

export function stripTargetKindPrefix(target: string): string {
  return stripChannelTargetPrefix(target);
}

export function buildChannelOutboundSessionRoute(
  params: ChannelOutboundSessionRouteParams,
): ChannelOutboundSessionRoute {
  return {
    channelId: params.channelId,
    accountId: params.accountId ?? DEFAULT_ACCOUNT_ID,
    target: params.target ?? '',
  };
}

export function isSecretRef(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('$');
}

export function createSubsystemLogger(name: string) {
  return (...args: unknown[]) => console.log(`[${name}]`, ...args);
}

export function normalizeAtHashSlug(slug: string): string {
  return slug.replace(/^[@#]/, '').toLowerCase();
}

export function normalizeHyphenSlug(slug: string): string {
  return slug.replace(/\s+/g, '-').toLowerCase();
}

export function tryReadFileSync(path: string): string | null {
  try {
    return require('fs').readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

export function loadSecretFileSync(_path: string, _opts?: SecretFileReadOptions): SecretFileReadResult | null {
  return null;
}

export function readSecretFileSync(_path: string): string | null {
  return null;
}

export function tryReadSecretFileSync(_path: string): string | null {
  return null;
}

export function clearAccountEntryFields(_config: Record<string, unknown>, _channelId: string, _accountId: string) {
  // no-op in host
}

export function applyAccountNameToChannelSection(
  _config: Record<string, unknown>,
  _channelId: string,
  _accountId: string,
  _name: string,
) {
  // no-op
}

export function migrateBaseNameToDefaultAccount(
  _config: Record<string, unknown>,
  _channelId: string,
) {
  // no-op
}

export function deleteAccountFromConfigSection(
  _config: Record<string, unknown>,
  _channelId: string,
  _accountId: string,
) {
  // no-op
}

export function setAccountEnabledInConfigSection(
  _config: Record<string, unknown>,
  _channelId: string,
  _accountId: string,
  _enabled: boolean,
) {
  // no-op
}

export function formatPairingApproveHint(_channelId: string): string {
  return '';
}

export function parseOptionalDelimitedEntries(input: string | undefined, delimiter = ','): string[] {
  if (!input) return [];
  return input.split(delimiter).map(s => s.trim()).filter(Boolean);
}

export function getChatChannelMeta(_channelId: string) {
  return { order: 100, description: '' };
}

export const channelTargetSchema = { type: 'string' as const };
export const channelTargetsSchema = { type: 'array' as const, items: { type: 'string' as const } };

export function optionalStringEnum<T extends string>(values: readonly T[]) {
  return { type: 'string' as const, enum: values };
}

export function stringEnum<T extends string>(values: readonly T[]) {
  return { type: 'string' as const, enum: values };
}

export function resolveGatewayBindUrl() {
  return { url: 'http://localhost:18030' };
}

export function resolveGatewayPort() {
  return 18030;
}

export function resolveTailnetHostWithRunner() {
  return '';
}

export function buildPluginConfigSchema(schema?: Record<string, unknown>) {
  return schema ?? emptyPluginConfigSchema;
}

export function delegateCompactionToRuntime() {
  // no-op
}

// KeyedAsyncQueue placeholder
export class KeyedAsyncQueue {
  async enqueue<T>(_key: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

export function enqueueKeyedTask<T>(_queue: KeyedAsyncQueue, _key: string, fn: () => Promise<T>): Promise<T> {
  return fn();
}
