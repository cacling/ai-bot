/**
 * openclaw/plugin-sdk/feishu compatibility
 *
 * Feishu-specific mega-surface: types, config, setup, conversation ID,
 * webhook guards, reply pipeline, and utility functions.
 */
import { z } from 'zod';

// --- Constants ---
export const DEFAULT_ACCOUNT_ID = 'default';
export const DEFAULT_GROUP_HISTORY_LIMIT = 10;
export const PAIRING_APPROVED_MESSAGE = '✅ 配对已批准';
export const WEBHOOK_ANOMALY_COUNTER_DEFAULTS = { window: 60_000, threshold: 100 };
export const WEBHOOK_RATE_LIMIT_DEFAULTS = { window: 1_000, max: 50 };

// --- Types (re-exported stubs) ---
export type HistoryEntry = { role: string; content: string; timestamp?: number };
export type ReplyPayload = { text?: string; media?: unknown; card?: unknown };
export type AllowlistMatch = { matched: boolean; entry?: string };
export type BaseProbeResult = { ok: boolean; message?: string };
export type ChannelGroupContext = { groupId: string; groupName?: string };
export type ChannelMessageActionName = string;
export type ChannelMeta = { id: string; name: string; icon?: string };
export type ChannelOutboundAdapter = any;
export type ChannelConfiguredBindingProvider = any;
export type ChannelConfiguredBindingConversationRef = any;
export type ChannelConfiguredBindingMatch = any;
export type ChannelPlugin = any;
export type OpenClawConfig = Record<string, unknown>;
export type ClawdbotConfig = Record<string, unknown>;
export type DmPolicy = 'open' | 'allowlist' | 'closed';
export type GroupToolPolicyConfig = { mode: string; tools?: string[] };
export type SecretInput = { key: string; value: string };
export type OutboundIdentity = { agentId: string; displayName?: string };
export type PluginRuntime = any;
export type AnyAgentTool = any;
export type OpenClawPluginApi = any;
export type RuntimeEnv = { dataDir: string; tmpDir: string };
export type WizardPrompter = any;

// --- Config Schema ---
export const emptyPluginConfigSchema = z.object({}).passthrough();

export function buildChannelConfigSchema() {
  return z.object({
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    verificationToken: z.string().optional(),
    encryptKey: z.string().optional(),
    allowFrom: z.array(z.string()).optional(),
  }).passthrough();
}

export function buildSecretInputSchema() {
  return z.object({
    appId: z.string(),
    appSecret: z.string(),
  });
}

// --- History ---
export function buildPendingHistoryContextFromMap(_map: Map<string, unknown>): HistoryEntry[] {
  return [];
}

export function clearHistoryEntriesIfEnabled(_config: unknown): void {}

export function recordPendingHistoryEntryIfEnabled(_config: unknown, _entry: HistoryEntry): void {}

// --- Logging ---
export function logTypingFailure(_err: unknown): void {}

// --- Action Gate ---
export function createActionGate(_config?: unknown) {
  return { check: () => true, authorize: () => true };
}

// --- Outbound ---
export function chunkTextForOutbound(text: string, _limit?: number): string[] {
  return [text];
}

export function resolveAgentOutboundIdentity(_config: unknown): OutboundIdentity {
  return { agentId: 'default', displayName: 'Agent' };
}

// --- Secret Input ---
export function buildSingleChannelSecretPromptState(_config: unknown) {
  return { hasSecret: false, promptMessage: '' };
}

export function hasConfiguredSecretInput(_config: unknown): boolean {
  return false;
}

export function normalizeResolvedSecretInputString(input: string): string {
  return input.trim();
}

export function normalizeSecretInputString(input: string): string {
  return input.trim();
}

export function promptSingleChannelSecretInput(_prompter: unknown): Promise<SecretInput | null> {
  return Promise.resolve(null);
}

// --- Allowlist ---
export function addWildcardAllowFrom(entries: string[]): string[] {
  return [...entries, '*'];
}

export function mergeAllowFromEntries(...groups: string[][]): string[] {
  return [...new Set(groups.flat())];
}

export function setTopLevelChannelAllowFrom(_config: unknown, _entries: string[]): void {}
export function setTopLevelChannelDmPolicyWithAllowFrom(_config: unknown, _policy: DmPolicy, _entries: string[]): void {}
export function setTopLevelChannelGroupPolicy(_config: unknown, _policy: unknown): void {}

// --- Setup ---
export function splitSetupEntries(_entries: unknown[]): { setup: unknown[]; runtime: unknown[] } {
  return { setup: [], runtime: [] };
}

export function feishuSetupWizard(_prompter: unknown) {
  return { run: async () => ({}) };
}

export function feishuSetupAdapter(_config: unknown) {
  return { validate: () => true };
}

export function formatDocsLink(path: string): string {
  return `https://docs.openclaw.dev/${path}`;
}

// --- Pairing ---
export function createChannelPairingController(_config: unknown) {
  return {
    issue: () => ({ code: 'MOCK', expiresAt: Date.now() + 300_000 }),
    verify: () => true,
  };
}

export function createReplyPrefixContext(_config: unknown) {
  return { prefix: '', suffix: '' };
}

// --- Reply Pipeline ---
export function createChannelReplyPipeline(_config: unknown) {
  return {
    process: (text: string) => text,
    send: async (_target: string, _payload: unknown) => ({ ok: true }),
  };
}

// --- Group Policy ---
export function resolveAllowlistProviderRuntimeGroupPolicy(_config: unknown): unknown {
  return { mode: 'open' };
}

export function resolveDefaultGroupPolicy(): unknown {
  return { mode: 'open' };
}

export function resolveOpenProviderRuntimeGroupPolicy(): unknown {
  return { mode: 'open' };
}

export function warnMissingProviderGroupPolicyFallbackOnce(): void {}

// --- Dedupe ---
export function createDedupeCache<T = string>(ttlMs = 60_000) {
  const cache = new Map<string, { value: T; expiresAt: number }>();
  return {
    has: (key: string) => {
      const entry = cache.get(key);
      if (!entry) return false;
      if (Date.now() > entry.expiresAt) { cache.delete(key); return false; }
      return true;
    },
    set: (key: string, value: T) => {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    get: (key: string) => cache.get(key)?.value,
    clear: () => cache.clear(),
  };
}

export function createPersistentDedupe(ttlMs = 60_000) {
  return createDedupeCache(ttlMs);
}

// --- Webhook Guards ---
export function installRequestBodyLimitGuard(_app: unknown, _limit?: number): void {}

export function readJsonBodyWithLimit(_req: unknown, _limit?: number): Promise<unknown> {
  return Promise.resolve({});
}

export function applyBasicWebhookRequestGuards(_app: unknown): void {}

export function createWebhookAnomalyTracker(_config?: unknown) {
  return { track: () => false, reset: () => {} };
}

export function createFixedWindowRateLimiter(_config?: unknown) {
  return { check: () => true, reset: () => {} };
}

// --- SSRF ---
export function fetchWithSsrFGuard(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

// --- Account / Normalize ---
export function normalizeAgentId(id: string): string {
  return id.trim().toLowerCase();
}

export function evaluateSenderGroupAccessForPolicy(_policy: unknown, _senderId: string): boolean {
  return true;
}

// --- Media ---
export function buildAgentMediaPayload(_media: unknown) {
  return { type: 'unknown', url: '' };
}

export function readJsonFileWithFallback<T>(path: string, fallback: T): T {
  try {
    const text = require('fs').readFileSync(path, 'utf-8');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

// --- Temp Path ---
export function withTempDownloadPath<T>(fn: (path: string) => T | Promise<T>): Promise<T> {
  const tmp = `/tmp/feishu-dl-${Date.now()}`;
  return Promise.resolve(fn(tmp));
}

// --- Conversation ID ---
export function buildFeishuConversationId(chatId: string, _accountId?: string): string {
  return `feishu:${chatId}`;
}

export function createFeishuThreadBindingManager() {
  const bindings = new Map<string, string>();
  return {
    bind: (threadId: string, conversationId: string) => bindings.set(threadId, conversationId),
    resolve: (threadId: string) => bindings.get(threadId),
    unbind: (threadId: string) => bindings.delete(threadId),
  };
}

export function parseFeishuDirectConversationId(convId: string) {
  return { chatId: convId.replace('feishu:', ''), isDirect: true };
}

export function parseFeishuConversationId(convId: string) {
  return { chatId: convId.replace('feishu:', ''), type: 'chat' };
}

export function parseFeishuTargetId(target: string) {
  return { chatId: target, type: 'user' };
}

// --- Status ---
export function buildBaseChannelStatusSummary(_account: unknown) {
  return { status: 'unknown', connected: false };
}

export function buildProbeChannelStatusSummary(_account: unknown, _probe: unknown) {
  return { status: 'unknown', connected: false, probeResult: null };
}

export function buildRuntimeAccountStatusSnapshot(_account: unknown) {
  return { status: 'unknown', lastActivity: null };
}

export function createDefaultChannelRuntimeState() {
  return { connected: false, lastHeartbeat: null, reconnectAttempts: 0 };
}
