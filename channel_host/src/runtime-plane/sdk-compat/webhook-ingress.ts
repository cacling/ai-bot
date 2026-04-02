/**
 * openclaw/plugin-sdk/webhook-ingress compatibility
 */
export function isRequestBodyLimitError(err: unknown): boolean { return false; }
export function readRequestBodyWithLimit(..._args: unknown[]): Promise<string> { return Promise.resolve(''); }
export function requestBodyErrorToText(err: unknown): string { return String(err); }
export function normalizePluginHttpPath(path: string): string { return path; }
export function registerPluginHttpRoute(..._args: unknown[]) {}
