/**
 * openclaw/plugin-sdk/retry-runtime compatibility
 */

// --- Types ---
export interface RetryConfig {
  maxAttempts: number;
  baseMs: number;
  maxMs: number;
  jitter?: boolean;
}

export interface RetryInfo {
  attempt: number;
  maxAttempts: number;
  lastError?: Error;
}

export interface RetryOptions {
  config?: Partial<RetryConfig>;
  onRetry?: (info: RetryInfo) => void;
}

export interface RetryRunner {
  run: <T>(fn: () => Promise<T>) => Promise<T>;
}

// --- Constants ---
export const TELEGRAM_RETRY_DEFAULTS: RetryConfig = {
  maxAttempts: 3,
  baseMs: 1000,
  maxMs: 15000,
  jitter: true,
};

// --- Functions ---
export function resolveRetryConfig(opts?: Partial<RetryConfig>): RetryConfig {
  return { ...TELEGRAM_RETRY_DEFAULTS, ...opts };
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseMs = 1000,
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn(); } catch (err) {
      if (i === maxAttempts - 1) throw err;
      await new Promise(r => setTimeout(r, baseMs * Math.pow(2, i)));
    }
  }
  throw new Error('unreachable');
}

export function createRateLimitRetryRunner(config?: Partial<RetryConfig>): RetryRunner {
  const cfg = resolveRetryConfig(config);
  return { run: (fn) => retryAsync(fn, cfg.maxAttempts, cfg.baseMs) };
}

export function createTelegramRetryRunner(config?: Partial<RetryConfig>): RetryRunner {
  return createRateLimitRetryRunner({ ...TELEGRAM_RETRY_DEFAULTS, ...config });
}
