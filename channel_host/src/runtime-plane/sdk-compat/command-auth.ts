/**
 * openclaw/plugin-sdk/command-auth compatibility
 */
export function hasControlCommand(..._args: unknown[]): boolean { return false; }
export function shouldComputeCommandAuthorized(..._args: unknown[]): boolean { return true; }
export function resolveControlCommandGate(..._args: unknown[]) { return { allowed: true }; }
