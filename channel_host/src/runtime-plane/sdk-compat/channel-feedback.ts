/**
 * openclaw/plugin-sdk/channel-feedback compatibility
 */
export function missingTargetError(..._args: unknown[]) { return new Error('missing target'); }
export function shouldAckReactionForWhatsApp(..._args: unknown[]): boolean { return false; }
