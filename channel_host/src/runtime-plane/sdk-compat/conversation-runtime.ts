/**
 * openclaw/plugin-sdk/conversation-runtime compatibility
 */
export type BindingTargetKind = 'dm' | 'group' | 'thread';
export type SessionBindingAdapter = Record<string, unknown>;
export type SessionBindingRecord = Record<string, unknown>;

export function upsertChannelPairingRequest(..._args: unknown[]) { return Promise.resolve(); }
export function getSessionBindingService(..._args: unknown[]) { return null; }
export function ensureConfiguredBindingRouteReady(..._args: unknown[]) { return Promise.resolve(); }
export function resolveConfiguredBindingRoute(..._args: unknown[]) { return null; }
export function registerSessionBindingAdapter(..._args: unknown[]) {}
export function unregisterSessionBindingAdapter(..._args: unknown[]) {}
export function resolveThreadBindingIdleTimeoutMsForChannel(..._args: unknown[]): number { return 0; }
export function resolveThreadBindingMaxAgeMsForChannel(..._args: unknown[]): number { return 0; }
export function resolveThreadBindingConversationIdFromBindingId(..._args: unknown[]) { return null; }
export function readChannelAllowFromStore(..._args: unknown[]) { return []; }
export function resolvePairingIdLabel(..._args: unknown[]) { return ''; }
export function recordInboundSession(..._args: unknown[]) {}
export function resolvePinnedMainDmOwnerFromAllowlist(..._args: unknown[]) { return null; }

// Testing export
export const __testing = {};
