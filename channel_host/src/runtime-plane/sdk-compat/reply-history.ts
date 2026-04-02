/**
 * openclaw/plugin-sdk/reply-history compatibility
 */
export type HistoryEntry = Record<string, unknown>;
export const DEFAULT_GROUP_HISTORY_LIMIT = 50;
export function recordPendingHistoryEntryIfEnabled(..._args: unknown[]) {}
export function clearHistoryEntriesIfEnabled(..._args: unknown[]) {}
