/**
 * openclaw/plugin-sdk/logging-core compatibility
 */
export function redactIdentifier(id: string): string {
  if (id.length <= 4) return '****';
  return id.slice(0, 2) + '****' + id.slice(-2);
}
