/**
 * Stub module for unimplemented openclaw/plugin-sdk/* surfaces.
 * Returns a Proxy that logs warnings on access rather than crashing.
 */

const WARNED = new Set<string>();

function warnOnce(surface: string) {
  if (WARNED.has(surface)) return;
  WARNED.add(surface);
  console.warn(`[channel-host] SDK compat stub accessed: ${surface} — not yet implemented`);
}

// Default export: a proxy that warns on property access
export default new Proxy({}, {
  get(_target, prop) {
    if (typeof prop === 'string') {
      warnOnce(`stub.${prop}`);
      // Return a no-op function for function calls
      return (..._args: unknown[]) => {
        warnOnce(`stub.${prop}()`);
        return undefined;
      };
    }
    return undefined;
  },
});

// Re-export as wildcard-compatible shape
export const __stub__ = true;
