/**
 * openclaw/plugin-sdk/config-runtime compatibility
 */

export type OpenClawConfig = Record<string, unknown>;
export type MarkdownTableMode = 'auto' | 'always' | 'never';
export type DmPolicy = 'allow' | 'block' | 'allowlist';
export type GroupPolicy = 'allow' | 'block' | 'allowlist';
export type ChannelGroupPolicy = GroupPolicy;
export type ReplyToMode = 'always' | 'never' | 'thread';
export type SessionResetMode = 'auto' | 'manual' | 'never';
export type SessionScope = 'user' | 'group' | 'channel';
export type StreamingMode = 'full' | 'partial' | 'none';
export type TtsMode = 'auto' | 'on' | 'off';
export type TtsAutoMode = 'voice-only' | 'always';
export type TtsProvider = string;
export type TtsConfig = Record<string, unknown>;
export type TtsModelOverrideConfig = Record<string, unknown>;
export type SignalReactionNotificationMode = 'always' | 'never';
export type SlackAccountConfig = Record<string, unknown>;
export type SlackChannelConfig = Record<string, unknown>;
export type SlackReactionNotificationMode = 'always' | 'never';
export type SlackSlashCommandConfig = Record<string, unknown>;
export type SlackLegacyDraftStreamMode = 'full' | 'partial' | 'none';
export type DiscordAccountConfig = Record<string, unknown>;
export type DiscordActionConfig = Record<string, unknown>;
export type DiscordAutoPresenceConfig = Record<string, unknown>;
export type DiscordExecApprovalConfig = Record<string, unknown>;
export type DiscordGuildChannelConfig = Record<string, unknown>;
export type DiscordGuildEntry = Record<string, unknown>;
export type DiscordIntentsConfig = Record<string, unknown>;
export type DiscordSlashCommandConfig = Record<string, unknown>;
export type TelegramAccountConfig = Record<string, unknown>;
export type TelegramActionConfig = Record<string, unknown>;
export type TelegramDirectConfig = Record<string, unknown>;
export type TelegramExecApprovalConfig = Record<string, unknown>;
export type TelegramGroupConfig = Record<string, unknown>;
export type TelegramInlineButtonsScope = string;
export type TelegramNetworkConfig = Record<string, unknown>;
export type TelegramTopicConfig = Record<string, unknown>;

let _configSnapshot: OpenClawConfig | null = null;

export function loadConfig(): OpenClawConfig { return _configSnapshot ?? {}; }
export function setRuntimeConfigSnapshot(config: OpenClawConfig) { _configSnapshot = config; }
export function getRuntimeConfigSnapshot(): OpenClawConfig | null { return _configSnapshot; }
export function clearRuntimeConfigSnapshot() { _configSnapshot = null; }
export function readConfigFileSnapshotForWrite() { return _configSnapshot ?? {}; }
export function writeConfigFile(_config: OpenClawConfig) {}
export function logConfigUpdated(..._args: unknown[]) {}
export function updateConfig(_patch: Partial<OpenClawConfig>) {}

export function resolveDefaultAgentId(): string { return 'default'; }
export function resolveMarkdownTableMode(_config?: unknown): MarkdownTableMode { return 'auto'; }
export function resolveChannelModelOverride(..._args: unknown[]) { return undefined; }
export function resolveChannelGroupPolicy(..._args: unknown[]): GroupPolicy { return 'allow'; }
export const GROUP_POLICY_BLOCKED_LABEL = 'blocked';
export function resolveAllowlistProviderRuntimeGroupPolicy(..._args: unknown[]): GroupPolicy { return 'allow'; }
export function resolveDefaultGroupPolicy(..._args: unknown[]): GroupPolicy { return 'allow'; }
export function resolveOpenProviderRuntimeGroupPolicy(..._args: unknown[]): GroupPolicy { return 'allow'; }
export function warnMissingProviderGroupPolicyFallbackOnce(..._args: unknown[]) {}

export function isNativeCommandsExplicitlyDisabled(..._args: unknown[]): boolean { return false; }
export function resolveNativeCommandsEnabled(..._args: unknown[]): boolean { return true; }
export function resolveNativeSkillsEnabled(..._args: unknown[]): boolean { return true; }

export const TELEGRAM_COMMAND_NAME_PATTERN = /^[a-z0-9_]+$/;
export function normalizeTelegramCommandName(name: string): string { return name.toLowerCase(); }
export function resolveTelegramCustomCommands(..._args: unknown[]) { return []; }

export function mapStreamingModeToSlackLegacyDraftStreamMode(..._args: unknown[]) { return 'none'; }
export function resolveDiscordPreviewStreamMode(..._args: unknown[]) { return 'none'; }
export function resolveSlackNativeStreaming(..._args: unknown[]) { return false; }
export function resolveSlackStreamingMode(..._args: unknown[]) { return 'none'; }
export function resolveTelegramPreviewStreamMode(..._args: unknown[]) { return 'none'; }

export function resolveActiveTalkProviderConfig(..._args: unknown[]) { return null; }
export function resolveAgentMaxConcurrent(..._args: unknown[]): number { return 1; }

export function loadCronStore() { return {}; }
export function resolveCronStorePath(): string { return './data/cron.json'; }
export function saveCronStore(_store: unknown) {}

export function applyModelOverrideToSessionEntry(..._args: unknown[]) {}
export function coerceSecretRef(value: unknown): string { return String(value ?? ''); }
export function resolveConfiguredSecretInputString(..._args: unknown[]): string { return ''; }
export function resolveConfiguredSecretInputWithFallback(..._args: unknown[]): string { return ''; }
export function resolveRequiredConfiguredSecretRefInputString(..._args: unknown[]): string { return ''; }

export function clearSessionStoreCacheForTest() {}
export function loadSessionStore() { return {}; }
export function readSessionUpdatedAt(..._args: unknown[]): number | null { return null; }
export function recordSessionMetaFromInbound(..._args: unknown[]) {}
export function saveSessionStore(_store: unknown) {}
export function resolveSessionKey(...args: string[]): string { return args.join(':'); }
export function resolveStorePath(): string { return './data'; }
export function updateLastRoute(..._args: unknown[]) {}
export function updateSessionStore(..._args: unknown[]) {}
export function resolveGroupSessionKey(..._args: unknown[]): string { return ''; }
export function canonicalizeMainSessionAlias(alias: string): string { return alias; }
export function evaluateSessionFreshness(..._args: unknown[]) { return { fresh: true }; }
export function resolveChannelResetConfig(..._args: unknown[]) { return {}; }
export function resolveSessionResetPolicy(..._args: unknown[]) { return {}; }
export function resolveSessionResetType(..._args: unknown[]) { return 'auto'; }
export function resolveThreadFlag(..._args: unknown[]) { return false; }
export function isDangerousNameMatchingEnabled(..._args: unknown[]): boolean { return false; }
export function resolveDangerousNameMatchingEnabled(..._args: unknown[]): boolean { return false; }
