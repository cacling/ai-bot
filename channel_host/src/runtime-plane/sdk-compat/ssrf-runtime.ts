/**
 * openclaw/plugin-sdk/ssrf-runtime compatibility
 */
export function validateUrl(_url: string): boolean { return true; }
export function isPrivateIp(_ip: string): boolean { return false; }
export function createSafeHttpClient(..._args: unknown[]) { return fetch; }
