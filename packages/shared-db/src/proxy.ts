/**
 * Proxy Configuration Utilities
 *
 * Unified mechanism for external URL proxy management.
 * Each external service declares NEEDS_PROXY in .env; runtime reads
 * PROXY_URL and injects proxy agent only when needed.
 *
 * Usage:
 *   import { getProxyUrl, needsProxy } from '@ai-bot/shared-db/proxy';
 *   const proxyUrl = needsProxy('WHATSAPP') ? getProxyUrl() : undefined;
 *
 * See: .specify/presets/telecom-team/templates/standards.md §10
 */

/** Get the unified proxy URL from env. Returns empty string if not set. */
export function getProxyUrl(): string {
  return process.env.PROXY_URL ?? '';
}

/**
 * Check if a named service needs proxy.
 * Reads `<serviceKey>_NEEDS_PROXY` from env.
 *
 * @param serviceKey - e.g. 'WHATSAPP', 'SKILL_CREATOR_OPENAI', 'FEISHU'
 */
export function needsProxy(serviceKey: string): boolean {
  return process.env[`${serviceKey}_NEEDS_PROXY`] === 'true';
}

/**
 * Get proxy URL for a service, or undefined if not needed.
 * Convenience function combining needsProxy + getProxyUrl.
 */
export function getServiceProxyUrl(serviceKey: string): string | undefined {
  if (!needsProxy(serviceKey)) return undefined;
  const url = getProxyUrl();
  return url || undefined;
}
