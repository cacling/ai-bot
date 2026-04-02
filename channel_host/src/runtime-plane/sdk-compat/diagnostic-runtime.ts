/**
 * openclaw/plugin-sdk/diagnostic-runtime compatibility
 */
export function isDiagnosticFlagEnabled(_flag: string): boolean {
  return false;
}

export function isDiagnosticsEnabled(): boolean {
  return process.env.OPENCLAW_DIAGNOSTICS === '1';
}
