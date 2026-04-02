/**
 * openclaw/plugin-sdk/allow-from compatibility
 */
export function formatAllowFromLowercase(entry: string): string { return entry.toLowerCase(); }
export function normalizeAllowFrom(entry: string): string { return entry.trim().toLowerCase(); }
export function isSenderAllowed(_senderId: string, _allowList: string[]): boolean { return true; }
export function firstDefined<T>(...values: (T | undefined | null)[]): T | undefined {
  return values.find(v => v !== undefined && v !== null) as T | undefined;
}
