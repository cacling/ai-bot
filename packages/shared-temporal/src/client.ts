const TEMPORAL_API_URL = process.env.TEMPORAL_API_URL ?? '';

/**
 * Fire-and-forget POST to Temporal Orchestrator API.
 * Returns true if successful, false on any failure (degraded mode).
 * 3s timeout — caller should NOT await this on the critical path.
 */
export async function signalTemporal(path: string, body: unknown): Promise<boolean> {
  if (!TEMPORAL_API_URL) return false;
  try {
    const resp = await fetch(`${TEMPORAL_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    return resp.ok;
  } catch {
    console.warn(`[temporal] signal failed (degraded): ${path}`);
    return false;
  }
}

/**
 * GET query to Temporal Orchestrator API.
 * Returns parsed JSON on success, null on any failure (degraded mode).
 */
export async function queryTemporal<T>(path: string): Promise<T | null> {
  if (!TEMPORAL_API_URL) return null;
  try {
    const resp = await fetch(`${TEMPORAL_API_URL}${path}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return null;
    return await resp.json() as T;
  } catch {
    console.warn(`[temporal] query failed (degraded): ${path}`);
    return null;
  }
}
