/**
 * openclaw/plugin-sdk/telegram-core compatibility
 *
 * Telegram-specific core types, config schema, account management,
 * and channel meta utilities.
 */
import { z } from 'zod';

// --- Constants ---
export const DEFAULT_ACCOUNT_ID = 'default';
export const PAIRING_APPROVED_MESSAGE = '✅ Pairing approved';

// --- Types ---
export type ChannelAccountSnapshot = Record<string, unknown>;
export type ChannelGatewayContext = Record<string, unknown>;
export type ChannelMessageActionAdapter = any;
export type ChannelPlugin = any;
export type OpenClawConfig = Record<string, unknown>;
export type PluginRuntime = any;
export type OpenClawPluginApi = any;
export type ChannelConfiguredBindingProvider = any;
export type ChannelConfiguredBindingConversationRef = any;
export type ChannelConfiguredBindingMatch = any;

export interface TelegramAccountConfig {
  token?: string;
  allowFrom?: string[];
  defaultTo?: string;
  webhookUrl?: string;
  pollingMode?: boolean;
  [key: string]: unknown;
}

export interface TelegramActionConfig {
  reactions?: boolean;
  commands?: boolean;
  [key: string]: unknown;
}

export interface TelegramNetworkConfig {
  timeout?: number;
  retries?: number;
  [key: string]: unknown;
}

// --- Config Schema ---
export const TelegramConfigSchema = z.object({
  token: z.string().optional(),
  allowFrom: z.array(z.string()).optional(),
  defaultTo: z.string().optional(),
  webhookUrl: z.string().optional(),
  pollingMode: z.boolean().optional(),
}).passthrough();

export const emptyPluginConfigSchema = z.object({}).passthrough();

export function buildChannelConfigSchema() {
  return TelegramConfigSchema;
}

// --- Channel Meta ---
export function getChatChannelMeta() {
  return {
    id: 'telegram',
    name: 'Telegram',
    icon: '✈️',
    supportsMedia: true,
    supportsPolls: true,
    supportsGroups: true,
    supportsInlineKeyboard: true,
  };
}

// --- Account Helpers ---
export function normalizeAccountId(id: string): string {
  return id.trim().toLowerCase();
}

export function parseTelegramTopicConversation(convId: string) {
  const parts = convId.split(':');
  return { chatId: parts[0], topicId: parts[1] ?? null };
}

export function clearAccountEntryFields(config: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...config };
  delete cleaned.token;
  delete cleaned.secretRef;
  return cleaned;
}

export function projectCredentialSnapshotFields(account: Record<string, unknown>) {
  return {
    hasToken: !!account.token,
    hasWebhook: !!account.webhookUrl,
  };
}

export function resolveConfiguredFromCredentialStatuses(statuses: Record<string, unknown>[]): boolean {
  return statuses.some(s => (s as any).hasToken);
}

export function resolveTelegramPollVisibility(_config: unknown): boolean {
  return true;
}

export function applyAccountNameToChannelSection(_config: unknown, _name: string): void {}
export function deleteAccountFromConfigSection(_config: unknown, _accountId: string): void {}
export function setAccountEnabledInConfigSection(_config: unknown, _accountId: string, _enabled: boolean): void {}
export function migrateBaseNameToDefaultAccount(_config: unknown): void {}
export function formatPairingApproveHint(_channelId: string): string {
  return 'Send /approve to complete pairing';
}

// --- Group Policy ---
export function resolveAllowlistProviderRuntimeGroupPolicy(_config: unknown): unknown {
  return { mode: 'open' };
}
export function resolveDefaultGroupPolicy(): unknown {
  return { mode: 'open' };
}

// --- Param Readers ---
export function jsonResult(data: unknown): string {
  return JSON.stringify(data);
}

export function readNumberParam(params: Record<string, unknown>, key: string): number | undefined {
  const v = params?.[key];
  return typeof v === 'number' ? v : undefined;
}

export function readReactionParams(params: Record<string, unknown>) {
  return { emoji: (params?.emoji as string) ?? '👍', messageId: params?.messageId as string };
}

export function readStringArrayParam(params: Record<string, unknown>, key: string): string[] {
  const v = params?.[key];
  return Array.isArray(v) ? v : [];
}

export function readStringOrNumberParam(params: Record<string, unknown>, key: string): string | number | undefined {
  const v = params?.[key];
  return typeof v === 'string' || typeof v === 'number' ? v : undefined;
}

export function readStringParam(params: Record<string, unknown>, key: string): string | undefined {
  const v = params?.[key];
  return typeof v === 'string' ? v : undefined;
}

export function resolvePollMaxSelections(_config: unknown): number {
  return 10;
}

// --- Status ---
export function buildTokenChannelStatusSummary(_account: unknown) {
  return { status: 'unknown', connected: false, hasToken: false };
}
