/**
 * openclaw/plugin-sdk/webhook-request-guards compatibility
 */
export const WEBHOOK_IN_FLIGHT_DEFAULTS = { maxConcurrent: 100, timeoutMs: 30000 };
export function beginWebhookRequestPipelineOrReject(..._args: unknown[]) { return { proceed: true }; }
export function createWebhookInFlightLimiter(..._args: unknown[]) {
  return { acquire: () => true, release: () => {} };
}
