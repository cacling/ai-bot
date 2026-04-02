/**
 * openclaw/plugin-sdk/reply-payload compatibility
 */
export function resolveSendableOutboundReplyParts(..._args: unknown[]) { return []; }
export function resolveTextChunksWithFallback(..._args: unknown[]) { return []; }
export function sendMediaWithLeadingCaption(..._args: unknown[]) { return Promise.resolve(); }
export function resolveOutboundMediaUrls(..._args: unknown[]) { return []; }
