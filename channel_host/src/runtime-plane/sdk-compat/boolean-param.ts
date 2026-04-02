/**
 * openclaw/plugin-sdk/boolean-param compatibility
 */
export function readBooleanParam(params: Record<string, unknown>, key: string, defaultValue = false): boolean {
  const v = params?.[key];
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return defaultValue;
}
