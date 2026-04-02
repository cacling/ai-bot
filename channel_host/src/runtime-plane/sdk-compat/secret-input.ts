/**
 * openclaw/plugin-sdk/secret-input compatibility
 */
export function hasSecretInput(..._args: unknown[]): boolean { return false; }
export function promptSecretInput(..._args: unknown[]): Promise<string> { return Promise.resolve(''); }
