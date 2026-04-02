/**
 * openclaw/plugin-sdk/channel-inbound compatibility
 */
export type NormalizedLocation = { lat: number; lng: number; label?: string };
export type EnvelopeFormatOptions = Record<string, unknown>;

export function buildMentionRegexes(..._args: unknown[]) { return []; }
export function matchesMentionPatterns(..._args: unknown[]) { return false; }
export function createInboundDebouncer(..._args: unknown[]) { return { shouldProcess: () => true }; }
export function formatInboundEnvelope(..._args: unknown[]) { return {}; }
export function formatLocationText(loc: NormalizedLocation): string { return `${loc.lat},${loc.lng}`; }
export function normalizeMentionText(text: string): string { return text; }
export function resolveInboundDebounceMs(..._args: unknown[]): number { return 0; }
export function resolveMentionGating(..._args: unknown[]) { return { shouldProcess: true }; }
export function resolveMentionGatingWithBypass(..._args: unknown[]) { return { shouldProcess: true }; }
export function resolveInboundSessionEnvelopeContext(..._args: unknown[]) { return {}; }
export function toLocationContext(loc: unknown) { return loc; }
