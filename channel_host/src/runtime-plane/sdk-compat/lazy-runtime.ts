/**
 * openclaw/plugin-sdk/lazy-runtime compatibility
 */
export function createLazyRuntimeNamedExport<T>(factory: () => T): () => T {
  let cached: T | undefined;
  return () => {
    if (cached === undefined) cached = factory();
    return cached;
  };
}
