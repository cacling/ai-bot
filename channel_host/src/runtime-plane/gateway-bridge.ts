/**
 * Gateway Bridge
 *
 * Manages live Baileys (WhatsApp Web) connections for channel accounts.
 * Delegates actual WebSocket connections to a Node.js sidecar process
 * (baileys-node-gateway.cjs) because Bun's built-in WebSocket drops
 * connections after ~30s.
 *
 * The Node.js gateway runs on BAILEYS_GATEWAY_PORT (default 18031).
 * This module proxies control commands (start/stop/status/send) to it.
 * Inbound messages are forwarded back via POST /webhooks/baileys-gateway.
 *
 * Usage:
 *   POST /api/channels/whatsapp/accounts/:id/start  -> startAccount()
 *   POST /api/channels/whatsapp/accounts/:id/stop   -> stopAccount()
 *   GET  /api/channels/whatsapp/accounts/:id/connection -> getConnectionStatus()
 */

import { resolve } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { emitDiagnostic } from '../control-plane/diagnostics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectionStatus {
  channelId: string;
  accountId: string;
  state: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string;
  connectedAt?: number;
  disconnectedAt?: number;
  messagesReceived: number;
  messagesSent: number;
}

// ---------------------------------------------------------------------------
// Node.js Gateway HTTP client
// ---------------------------------------------------------------------------

const GATEWAY_PORT = Number(process.env.BAILEYS_GATEWAY_PORT ?? 18031);
const GATEWAY_BASE = `http://127.0.0.1:${GATEWAY_PORT}`;

async function gwFetch(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${GATEWAY_BASE}${path}`, opts);
  return res.json();
}

async function isGatewayRunning(): Promise<boolean> {
  try {
    const r = await fetch(`${GATEWAY_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a WhatsApp account connection via the Node.js Baileys gateway.
 */
export async function startAccount(
  channelId: string,
  accountId: string,
  config: {
    authDir?: string;
    verbose?: boolean;
    sendReadReceipts?: boolean;
    debounceMs?: number;
    mediaMaxMb?: number;
  } = {},
): Promise<{ success: boolean; error?: string }> {
  // Only WhatsApp supported for now
  if (channelId !== 'whatsapp') {
    return { success: false, error: `Gateway bridge not implemented for channel '${channelId}'` };
  }

  // Check gateway is running
  if (!(await isGatewayRunning())) {
    return { success: false, error: 'Baileys Node.js gateway is not running. Start it with: node src/runtime-plane/baileys-node-gateway.cjs' };
  }

  // Resolve auth directory
  const authDir = config.authDir ?? resolve('./data/whatsapp', accountId, 'auth');
  if (!existsSync(authDir)) {
    mkdirSync(authDir, { recursive: true });
  }

  emitDiagnostic(channelId, 'info', 'runtime',
    `Starting gateway connection for ${channelId}/${accountId} (authDir: ${authDir})`);

  try {
    const result = await gwFetch('/start', 'POST', { channelId, accountId, authDir }) as Record<string, unknown>;
    return { success: !!result.success, error: result.error as string | undefined };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}

/**
 * Stop an active gateway connection.
 */
export async function stopAccount(
  channelId: string,
  accountId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await gwFetch('/stop', 'POST', { channelId, accountId }) as Record<string, unknown>;

    emitDiagnostic(channelId, 'info', 'runtime',
      `Gateway stopped for ${channelId}/${accountId}`);

    return { success: !!result.success, error: result.error as string | undefined };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}

/**
 * Get the connection status for an account.
 */
export async function getConnectionStatus(
  channelId: string,
  accountId: string,
): Promise<ConnectionStatus | undefined> {
  try {
    const result = await gwFetch(`/status/${channelId}/${accountId}`) as Record<string, unknown>;
    if (result.error) return undefined;
    return result as unknown as ConnectionStatus;
  } catch {
    return undefined;
  }
}

/**
 * List all active/recent connections.
 */
export async function listConnectionStatuses(): Promise<ConnectionStatus[]> {
  try {
    const result = await gwFetch('/connections') as ConnectionStatus[];
    return result;
  } catch {
    return [];
  }
}

/**
 * Send a message via the Node.js Baileys gateway.
 * Used by the Outbound Bridge as a direct send path.
 */
export async function sendViaBaileys(
  channelId: string,
  accountId: string,
  to: string,
  text: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const result = await gwFetch('/send', 'POST', { channelId, accountId, to, text }) as Record<string, unknown>;
    return {
      success: !!result.success,
      messageId: result.messageId as string | undefined,
      error: result.error as string | undefined,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}
