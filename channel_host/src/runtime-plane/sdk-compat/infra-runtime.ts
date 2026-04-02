/**
 * openclaw/plugin-sdk/infra-runtime compatibility
 *
 * Infrastructure mega-surface: backoff, dedupe, diagnostics, exec approvals,
 * fetch, file-lock, heartbeat, identity, retry, secure-random, system events, etc.
 */

// --- Exec Approval ---
export interface ExecApprovalRequest {
  id: string;
  command: string;
  requestedBy: string;
  status: 'pending' | 'approved' | 'denied';
}

export interface PluginApprovalRequest {
  id: string;
  pluginId: string;
  action: string;
  status: 'pending' | 'approved' | 'denied';
}

export function parseExecApprovalCommandText(text: string): { command: string; args: string[] } | null {
  if (!text.startsWith('/approve') && !text.startsWith('/exec')) return null;
  const parts = text.trim().split(/\s+/);
  return { command: parts[0], args: parts.slice(1) };
}

// --- Backoff ---
export function exponentialBackoff(attempt: number, baseMs = 1000, maxMs = 30000): number {
  return Math.min(baseMs * Math.pow(2, attempt), maxMs);
}

// --- Dedupe ---
export function createDedupeCache<T = string>(ttlMs = 60_000) {
  const cache = new Map<string, { value: T; expiresAt: number }>();
  return {
    has: (key: string) => {
      const e = cache.get(key);
      if (!e) return false;
      if (Date.now() > e.expiresAt) { cache.delete(key); return false; }
      return true;
    },
    set: (key: string, value: T) => cache.set(key, { value, expiresAt: Date.now() + ttlMs }),
    get: (key: string) => cache.get(key)?.value,
    clear: () => cache.clear(),
  };
}

// --- Diagnostic Events/Flags ---
export function emitDiagnosticEvent(_type: string, _data?: unknown): void {}
export function isDiagnosticFlagEnabled(_flag: string): boolean { return false; }

// --- Fetch ---
export function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function fetchWithSsrfGuard(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

// --- File Lock ---
export function acquireFileLock(_path: string): { release: () => void } {
  return { release: () => {} };
}

// --- Format ---
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

// --- FS Safe ---
export function readFileSafe(path: string): string | null {
  try { return require('fs').readFileSync(path, 'utf-8'); } catch { return null; }
}

export function writeFileSafe(path: string, content: string): boolean {
  try { require('fs').writeFileSync(path, content, 'utf-8'); return true; } catch { return false; }
}

// --- Heartbeat ---
export function createHeartbeatTracker(intervalMs = 30_000) {
  let lastBeat = Date.now();
  return {
    beat: () => { lastBeat = Date.now(); },
    isAlive: () => Date.now() - lastBeat < intervalMs * 2,
    lastBeatAt: () => lastBeat,
  };
}

// --- Identity ---
export function resolveHostIdentity(): string {
  return require('os').hostname();
}

// --- JSON Files ---
export function readJsonFile<T>(path: string, fallback: T): T {
  try { return JSON.parse(require('fs').readFileSync(path, 'utf-8')); } catch { return fallback; }
}

export function writeJsonFile(path: string, data: unknown): void {
  require('fs').writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

// --- Retry ---
export function retryAsync<T>(fn: () => Promise<T>, maxAttempts = 3, baseMs = 1000): Promise<T> {
  return (async () => {
    for (let i = 0; i < maxAttempts; i++) {
      try { return await fn(); } catch (err) {
        if (i === maxAttempts - 1) throw err;
        await new Promise(r => setTimeout(r, exponentialBackoff(i, baseMs)));
      }
    }
    throw new Error('unreachable');
  })();
}

// --- Secure Random ---
export function generateSecureRandom(bytes = 32): string {
  return crypto.randomUUID();
}

// --- System Events ---
export function emitSystemEvent(_event: string, _data?: unknown): void {}
export function createSystemMessage(_text: string): { text: string; timestamp: number } {
  return { text: _text, timestamp: Date.now() };
}

// --- Transport Ready ---
export function waitForTransportReady(_timeoutMs?: number): Promise<boolean> {
  return Promise.resolve(true);
}

// --- Outbound Delegates (re-export) ---
export function createRuntimeOutboundDelegates(_config: unknown) {
  return { send: async () => ({ ok: true }) };
}

// --- Approval helpers ---
export function createNativeApprovalDelivery(_config: unknown) {
  return { deliver: async () => ({ delivered: true }) };
}

export function createNativeApprovalRuntime(_config: unknown) {
  return { approve: async () => true, deny: async () => true };
}

export function resolvePluginApproval(_request: PluginApprovalRequest): boolean {
  return true;
}

// --- Proxy / SSRF ---
export function resolveProxyEnv(): Record<string, string> { return {}; }
export function createProxyFetch(_proxyUrl?: string) { return fetch; }

// --- WSL ---
export function isWsl(): boolean { return false; }

// --- Hostname ---
export function resolveHostname(): string { return require('os').hostname(); }

// --- Home dir ---
export function resolveHomeDir(): string { return require('os').homedir(); }

// --- Tmp dir ---
export function resolveOpenClawTmpDir(): string { return require('os').tmpdir(); }

// --- Secret file ---
export function readSecretFile(_path: string): string | null { return null; }

// --- Map size ---
export function mapSize(map: Map<unknown, unknown> | Set<unknown>): number { return map.size; }

// --- Channel Activity ---
export function recordChannelActivity(_channelId: string, _type: string): void {}

// --- HTTP Body ---
export function readJsonBodyWithLimit(_req: unknown, _limit?: number): Promise<unknown> {
  return Promise.resolve({});
}

// --- Send Deps ---
export function resolveSendDeps(_config: unknown) {
  return { send: async () => ({ ok: true }) };
}

// --- SCP Host ---
export function resolveScpHost(): string { return 'localhost'; }

// --- Local File Access ---
export function resolveLocalFileAccess(_path: string): boolean { return true; }

// --- Fetch Timeout ---
export function createFetchWithTimeout(timeoutMs = 30_000) {
  return (url: string, init?: RequestInit) => fetchWithTimeout(url, init, timeoutMs);
}

// --- Undici ---
export function setGlobalDispatcher(_dispatcher: unknown): void {}

// --- Retry Policy ---
export interface RetryPolicy { maxAttempts: number; baseMs: number; maxMs: number }
export function createRetryPolicy(config?: Partial<RetryPolicy>): RetryPolicy {
  return { maxAttempts: config?.maxAttempts ?? 3, baseMs: config?.baseMs ?? 1000, maxMs: config?.maxMs ?? 30000 };
}
