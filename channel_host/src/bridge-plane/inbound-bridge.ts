/**
 * Inbound Bridge
 *
 * Receives raw inbound envelopes from channel plugins, normalizes them into
 * ChannelIngressEvent, and forwards to ai-bot Interaction Platform.
 *
 * The bridge is the single integration seam between plugin world and ai-bot world.
 * Plugins never call Interaction Platform directly.
 */

import type { ChannelIngressEvent } from '../types';
import { emitDiagnostic } from '../control-plane/diagnostics';

// ---------------------------------------------------------------------------
// Event Bus (in-process listeners + HTTP forwarding)
// ---------------------------------------------------------------------------

type IngressListener = (event: ChannelIngressEvent) => void | Promise<void>;
const listeners: IngressListener[] = [];

/**
 * Register a listener that receives every normalized ingress event.
 * Used by tests and in-process consumers.
 */
export function onIngress(listener: IngressListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

// ---------------------------------------------------------------------------
// Envelope → ChannelIngressEvent normalizer
// ---------------------------------------------------------------------------

export interface RawInboundEnvelope {
  /** Channel identifier (e.g. 'whatsapp', 'feishu', 'line') */
  channelId: string;
  /** Channel account this message arrived on */
  channelAccountId: string;
  /** Platform-specific conversation/thread ID */
  threadId?: string;
  /** Platform-specific sender ID */
  senderId?: string;
  /** Message content */
  text?: string;
  /** Media payload (images, files, etc.) */
  media?: unknown;
  /** Structured action payload (button clicks, card actions, etc.) */
  action?: unknown;
  /** Plugin-provided metadata */
  metadata?: Record<string, unknown>;
  /** Optional timestamp override (ms). Defaults to Date.now(). */
  timestamp?: number;
}

/**
 * Normalize a raw inbound envelope from a plugin into a ChannelIngressEvent.
 */
export function normalizeInbound(raw: RawInboundEnvelope): ChannelIngressEvent {
  let messageType: ChannelIngressEvent['messageType'] = 'text';
  let payload: unknown = raw.text ?? '';

  if (raw.action) {
    messageType = 'action';
    payload = raw.action;
  } else if (raw.media) {
    messageType = 'media';
    payload = raw.media;
  }

  return {
    channelId: raw.channelId,
    channelAccountId: raw.channelAccountId ?? 'default',
    externalThreadId: raw.threadId ?? '',
    externalSenderId: raw.senderId ?? '',
    messageType,
    payload,
    metadata: raw.metadata ?? {},
    timestamp: raw.timestamp ?? Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Dispatch: notify listeners + forward to Interaction Platform
// ---------------------------------------------------------------------------

/** Interaction Platform base URL (configurable via env) */
const INTERACTION_PLATFORM_URL =
  process.env.INTERACTION_PLATFORM_URL ?? 'http://localhost:18022';

/** CDP base URL */
const CDP_URL = process.env.CDP_URL ?? 'http://localhost:18020';

/**
 * Main entry point: receive a raw envelope from a plugin, normalize it,
 * dispatch to all listeners, and forward to Interaction Platform.
 */
export async function handleInbound(raw: RawInboundEnvelope): Promise<ChannelIngressEvent> {
  const event = normalizeInbound(raw);

  // Emit diagnostic
  emitDiagnostic({
    pluginId: event.channelId,
    level: 'info',
    category: 'inbound',
    message: `Inbound ${event.messageType} from ${event.externalSenderId} on ${event.channelId}/${event.channelAccountId}`,
    details: {
      threadId: event.externalThreadId,
      senderId: event.externalSenderId,
      messageType: event.messageType,
    },
  });

  // Notify in-process listeners
  for (const listener of listeners) {
    try {
      await listener(event);
    } catch (err) {
      console.error('[channel-host] Ingress listener error:', err);
    }
  }

  // Forward to Interaction Platform (fire-and-forget, best effort)
  forwardToInteractionPlatform(event).catch(err => {
    console.warn('[channel-host] Failed to forward to Interaction Platform:', err?.message);
  });

  // Resolve identity via CDP (fire-and-forget, best effort)
  resolveIdentity(event).catch(err => {
    console.warn('[channel-host] Failed to resolve identity via CDP:', err?.message);
  });

  // Call ai-bot agent and send reply back via channel gateway (async, non-blocking)
  // Unified for all channels — phone resolution via CDP, reply via channel-specific gateway
  if (event.messageType === 'text' && event.payload) {
    callAgentAndReply(event).catch(err => {
      console.error('[channel-host] Agent reply error:', err?.message);
    });
  }

  return event;
}

// ---------------------------------------------------------------------------
// External system integration (best-effort, non-blocking)
// ---------------------------------------------------------------------------

async function forwardToInteractionPlatform(event: ChannelIngressEvent): Promise<void> {
  try {
    const resp = await fetch(`${INTERACTION_PLATFORM_URL}/api/interactions/materialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'channel-host',
        channelId: event.channelId,
        channelAccountId: event.channelAccountId,
        externalThreadId: event.externalThreadId,
        externalSenderId: event.externalSenderId,
        messageType: event.messageType,
        payload: event.payload,
        metadata: event.metadata,
        timestamp: event.timestamp,
      }),
    });
    if (!resp.ok) {
      console.warn(`[channel-host] Interaction Platform returned ${resp.status}`);
    }
  } catch {
    // Silently ignore connection errors (service may not be running)
  }
}

// ---------------------------------------------------------------------------
// CDP Identity Resolution: channel sender ID → phone
// ---------------------------------------------------------------------------

/** Map channelId to CDP identity_type */
const CHANNEL_IDENTITY_TYPE: Record<string, string> = {
  whatsapp: 'wa_id',
  feishu: 'feishu_open_id',
  line: 'line_user_id',
  telegram: 'telegram_id',
};

/** Phone cache: `${channelId}:${senderId}` → phone (avoids repeated CDP calls) */
const phoneCache = new Map<string, string>();

/**
 * Resolve a channel-specific sender ID to a phone number via CDP.
 * Returns phone string or empty string if not found.
 */
async function resolvePhoneViaCDP(channelId: string, senderId: string): Promise<string> {
  if (!senderId) return '';

  const cacheKey = `${channelId}:${senderId}`;
  const cached = phoneCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const identityType = CHANNEL_IDENTITY_TYPE[channelId];
  if (!identityType) {
    phoneCache.set(cacheKey, '');
    return '';
  }

  try {
    const resp = await fetch(`${CDP_URL}/api/cdp/identity/resolve-phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity_type: identityType,
        identity_value: senderId,
      }),
    });

    if (!resp.ok) {
      phoneCache.set(cacheKey, '');
      return '';
    }

    const data = await resp.json() as { resolved: boolean; phone?: string; display_name?: string };
    const phone = data.resolved && data.phone ? data.phone : '';

    if (phone) {
      console.log(`[channel-host] CDP resolved ${channelId}/${senderId} → phone ${phone} (${data.display_name})`);
    }

    phoneCache.set(cacheKey, phone);
    return phone;
  } catch {
    phoneCache.set(cacheKey, '');
    return '';
  }
}

// ---------------------------------------------------------------------------
// AI Agent integration: call backend /api/chat and reply via channel gateway
// ---------------------------------------------------------------------------

/** Backend base URL */
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:18472';

/** Baileys gateway base URL */
const BAILEYS_GATEWAY_URL =
  process.env.BAILEYS_GATEWAY_URL ?? 'http://127.0.0.1:18031';

/** Feishu gateway base URL */
const FEISHU_GATEWAY_URL =
  process.env.FEISHU_GATEWAY_URL ?? 'http://127.0.0.1:18032';

/** Session ID mapping: threadId → session_id for multi-turn conversations */
const sessionMap = new Map<string, string>();

function getOrCreateSessionId(channelId: string, threadId: string): string {
  const key = `${channelId}:${threadId}`;
  let sid = sessionMap.get(key);
  if (!sid) {
    sid = `${channelId}-${threadId}-${Date.now()}`;
    sessionMap.set(key, sid);
  }
  return sid;
}

/**
 * Unified agent call: resolve phone via CDP, call agent, reply via channel gateway.
 * Works for all channels (WhatsApp, Feishu, LINE, Telegram, etc.)
 */
async function callAgentAndReply(event: ChannelIngressEvent): Promise<void> {
  const text = String(event.payload);
  if (!text.trim()) return;

  const sessionId = getOrCreateSessionId(event.channelId, event.externalThreadId);

  // Resolve phone via CDP (channel-agnostic)
  const userPhone = await resolvePhoneViaCDP(event.channelId, event.externalSenderId);

  console.log(`[channel-host] Calling agent: channel=${event.channelId}, text="${text.slice(0, 50)}", session=${sessionId}, phone=${userPhone || '(unknown)'}`);

  try {
    const agentResp = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        session_id: sessionId,
        user_phone: userPhone,
        lang: 'zh',
      }),
      signal: AbortSignal.timeout(180_000), // 3 min timeout for agent
    });

    if (!agentResp.ok) {
      const errBody = await agentResp.text();
      console.error(`[channel-host] Agent returned ${agentResp.status}: ${errBody}`);
      return;
    }

    const result = await agentResp.json() as {
      response?: string;
      card?: { type: string; data: unknown };
    };

    const replyText = result.response;
    if (!replyText) {
      console.warn('[channel-host] Agent returned empty response');
      return;
    }

    console.log(`[channel-host] Agent replied (${event.channelId}): "${replyText.slice(0, 100)}..."`);

    // Route reply to the correct channel gateway
    await sendReplyViaChannel(event, replyText);
  } catch (err) {
    console.error('[channel-host] Agent call failed:', err instanceof Error ? err.message : err);
  }
}

/** Route reply to the correct channel gateway */
async function sendReplyViaChannel(event: ChannelIngressEvent, text: string): Promise<void> {
  switch (event.channelId) {
    case 'whatsapp': {
      const resp = await fetch(`${BAILEYS_GATEWAY_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: event.channelId,
          accountId: event.channelAccountId,
          to: event.externalThreadId,
          text,
        }),
      });
      const result = await resp.json() as { success: boolean; error?: string };
      if (!result.success) {
        console.error(`[channel-host] WhatsApp send failed: ${result.error}`);
      } else {
        console.log(`[channel-host] WhatsApp reply sent to ${event.externalThreadId}`);
      }
      break;
    }
    case 'feishu': {
      const resp = await fetch(`${FEISHU_GATEWAY_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: event.externalThreadId,
          text,
        }),
      });
      const result = await resp.json() as { success: boolean; error?: string };
      if (!result.success) {
        console.error(`[channel-host] Feishu send failed: ${result.error}`);
      } else {
        console.log(`[channel-host] Feishu reply sent to ${event.externalThreadId}`);
      }
      break;
    }
    default:
      console.warn(`[channel-host] No reply gateway for channel: ${event.channelId}`);
  }
}

async function resolveIdentity(event: ChannelIngressEvent): Promise<void> {
  if (!event.externalSenderId) return;
  const identityType = CHANNEL_IDENTITY_TYPE[event.channelId];
  if (!identityType) return;
  try {
    await fetch(`${CDP_URL}/api/cdp/identity/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity_type: identityType,
        identity_value: event.externalSenderId,
      }),
    });
  } catch {
    // Silently ignore
  }
}
