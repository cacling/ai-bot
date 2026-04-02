/**
 * openclaw/plugin-sdk/account-resolution compatibility
 */
export type OpenClawConfig = Record<string, unknown>;
export function normalizeE164(phone: string): string { return phone.replace(/[^+\d]/g, ''); }
export function normalizeAccountId(id: string | undefined): string { return id?.trim() || 'default'; }
export function resolveMergedAccountConfig(..._args: unknown[]) { return {}; }
export function resolveAccountEntry(..._args: unknown[]) { return null; }
