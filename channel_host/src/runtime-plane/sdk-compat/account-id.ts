/**
 * openclaw/plugin-sdk/account-id compatibility
 */
export const DEFAULT_ACCOUNT_ID = 'default';
export function normalizeAccountId(id: string | undefined): string {
  return id?.trim() || DEFAULT_ACCOUNT_ID;
}
