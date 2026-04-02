/**
 * openclaw/plugin-sdk/routing compatibility
 */
export type ResolvedAgentRoute = { agentId: string; sessionKey: string };
export const DEFAULT_ACCOUNT_ID = 'default';

export function buildAgentSessionKey(channelId: string, accountId: string, target: string): string {
  return `${channelId}:${accountId}:${target}`;
}

export function buildGroupHistoryKey(channelId: string, groupId: string): string {
  return `${channelId}:group:${groupId}`;
}

export function deriveLastRoutePolicy(..._args: unknown[]) { return {}; }
export function normalizeMainKey(key: string): string { return key; }
export function normalizeAccountId(id: string | undefined): string { return id?.trim() || DEFAULT_ACCOUNT_ID; }
export function resolveAgentRoute(..._args: unknown[]) { return { agentId: 'default', sessionKey: '' }; }
export function resolveAgentIdFromSessionKey(key: string): string {
  const parts = key.split(':');
  return parts[0] ?? 'default';
}
