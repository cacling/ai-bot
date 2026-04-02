/**
 * openclaw/plugin-sdk/web-media compatibility
 */
export type LocalMediaAccessErrorCode = 'not_found' | 'access_denied' | 'unknown';
export function loadWebMedia(..._args: unknown[]): Promise<Buffer | null> { return Promise.resolve(null); }
