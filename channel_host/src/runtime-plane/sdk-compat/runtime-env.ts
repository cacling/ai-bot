/**
 * openclaw/plugin-sdk/runtime-env compatibility
 */

export type RuntimeEnv = {
  verbose: boolean;
  yes: boolean;
  dataDir: string;
  tmpDir: string;
};

export type BackoffPolicy = { baseMs: number; maxMs: number; factor: number };

export function createNonExitingRuntime(): RuntimeEnv {
  return { verbose: false, yes: false, dataDir: './data', tmpDir: './data/tmp' };
}

export const defaultRuntime = createNonExitingRuntime();

export function danger(...args: unknown[]) { console.warn('[danger]', ...args); }
export function info(...args: unknown[]) { console.log('[info]', ...args); }
export function warn(...args: unknown[]) { console.warn('[warn]', ...args); }
export function success(...args: unknown[]) { console.log('[success]', ...args); }
export function logVerbose(...args: unknown[]) { if (shouldLogVerbose()) console.log('[verbose]', ...args); }
export function logVerboseConsole(...args: unknown[]) { logVerbose(...args); }

let _verbose = false;
let _yes = false;

export function isVerbose(): boolean { return _verbose; }
export function setVerbose(v: boolean) { _verbose = v; }
export function shouldLogVerbose(): boolean { return _verbose; }
export function isYes(): boolean { return _yes; }
export function setYes(v: boolean) { _yes = v; }

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export function isTruthyEnvValue(val: string | undefined): boolean {
  return val === '1' || val === 'true' || val === 'yes';
}

export function waitForAbortSignal(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
}

export function computeBackoff(attempt: number, policy?: Partial<BackoffPolicy>): number {
  const base = policy?.baseMs ?? 1000;
  const max = policy?.maxMs ?? 30000;
  const factor = policy?.factor ?? 2;
  return Math.min(base * Math.pow(factor, attempt), max);
}

export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

export function formatDurationPrecise(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatDurationSeconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number; policy?: Partial<BackoffPolicy> },
): Promise<T> {
  const max = opts?.maxAttempts ?? 3;
  let lastError: unknown;
  for (let i = 0; i < max; i++) {
    try { return await fn(); } catch (err) {
      lastError = err;
      if (i < max - 1) await sleep(computeBackoff(i, opts?.policy));
    }
  }
  throw lastError;
}

export function ensureGlobalUndiciEnvProxyDispatcher() { /* no-op in host */ }
export function registerUnhandledRejectionHandler() { /* no-op in host */ }
export function isWSL2Sync(): boolean { return false; }

// Logging re-exports (placeholder for ../logging.js)
export function createSubsystemLogger(name: string) {
  return (...args: unknown[]) => console.log(`[${name}]`, ...args);
}
export function getChildLogger(name: string) { return createSubsystemLogger(name); }
export function setLoggerOverride(_logger: unknown) {}
export function resetLogger() {}
export function toPinoLikeLogger(_logger: unknown) { return {}; }
export function redactIdentifier(id: string): string {
  if (id.length <= 4) return '****';
  return id.slice(0, 2) + '****' + id.slice(-2);
}
