/**
 * Feishu Gateway
 *
 * Handles Feishu bot integration:
 * - Webhook event verification (challenge)
 * - Inbound message parsing (im.message.receive_v1)
 * - Outbound message sending via Feishu Open API
 * - Tenant access token management (auto-refresh)
 *
 * Credentials are read from env:
 *   FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_VERIFICATION_TOKEN, FEISHU_ENCRYPT_KEY
 */

const FEISHU_APP_ID = process.env.FEISHU_APP_ID ?? '';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET ?? '';
const FEISHU_VERIFICATION_TOKEN = process.env.FEISHU_VERIFICATION_TOKEN ?? '';
const FEISHU_API_BASE = process.env.FEISHU_API_BASE ?? 'https://open.feishu.cn/open-apis';

// ---------------------------------------------------------------------------
// Tenant Access Token (auto-refresh)
// ---------------------------------------------------------------------------

let tenantToken = '';
let tokenExpiresAt = 0;

async function getTenantToken(): Promise<string> {
  if (tenantToken && Date.now() < tokenExpiresAt - 60_000) {
    return tenantToken;
  }

  console.log('[feishu-gw] Refreshing tenant_access_token...');
  const resp = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET,
    }),
  });

  const data = await resp.json() as {
    code: number;
    msg: string;
    tenant_access_token?: string;
    expire?: number;
  };

  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`Failed to get tenant token: ${data.msg} (code=${data.code})`);
  }

  tenantToken = data.tenant_access_token;
  tokenExpiresAt = Date.now() + (data.expire ?? 7200) * 1000;
  console.log(`[feishu-gw] Got tenant token, expires in ${data.expire}s`);
  return tenantToken;
}

// ---------------------------------------------------------------------------
// Webhook Event Handling
// ---------------------------------------------------------------------------

export interface FeishuWebhookBody {
  /** URL verification challenge */
  challenge?: string;
  token?: string;
  type?: string;

  /** Event callback v2 */
  schema?: string;
  header?: {
    event_id: string;
    event_type: string;
    create_time: string;
    token: string;
    app_id: string;
    tenant_key: string;
  };
  event?: Record<string, unknown>;
}

/**
 * Verify the webhook token matches our verification token.
 */
export function verifyToken(token: string | undefined): boolean {
  if (!FEISHU_VERIFICATION_TOKEN) return true; // no token configured
  return token === FEISHU_VERIFICATION_TOKEN;
}

/**
 * Handle URL verification challenge (Feishu sends this when configuring webhook URL).
 */
export function handleChallenge(body: FeishuWebhookBody): { challenge: string } | null {
  if (body.type === 'url_verification' && body.challenge) {
    return { challenge: body.challenge };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Event deduplication (Feishu may retry events)
// ---------------------------------------------------------------------------

const processedEvents = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isDuplicate(eventId: string): boolean {
  const now = Date.now();
  // Cleanup old entries
  if (processedEvents.size > 1000) {
    for (const [id, ts] of processedEvents) {
      if (now - ts > DEDUP_TTL_MS) processedEvents.delete(id);
    }
  }

  if (processedEvents.has(eventId)) return true;
  processedEvents.set(eventId, now);
  return false;
}

// ---------------------------------------------------------------------------
// Parse inbound message event
// ---------------------------------------------------------------------------

export interface FeishuInboundMessage {
  eventId: string;
  messageId: string;
  chatId: string;
  chatType: 'p2p' | 'group';
  senderId: string;
  senderName?: string;
  messageType: string;
  content: string;
  timestamp: number;
}

/**
 * Parse a Feishu im.message.receive_v1 event into a structured message.
 * Returns null if the event is not a message event or should be skipped.
 */
export function parseMessageEvent(body: FeishuWebhookBody): FeishuInboundMessage | null {
  const header = body.header;
  const event = body.event as Record<string, unknown> | undefined;
  if (!header || !event) return null;

  if (header.event_type !== 'im.message.receive_v1') return null;

  const eventId = header.event_id;
  if (isDuplicate(eventId)) {
    console.log(`[feishu-gw] Duplicate event ${eventId}, skipping`);
    return null;
  }

  const sender = event.sender as Record<string, unknown> | undefined;
  const message = event.message as Record<string, unknown> | undefined;
  if (!message) return null;

  const senderId = (sender?.sender_id as Record<string, unknown>)?.open_id as string ?? '';
  const senderName = sender?.sender_id ? undefined : undefined; // Feishu doesn't always include name

  const chatId = message.chat_id as string ?? '';
  const chatType = (message.chat_type as string) === 'p2p' ? 'p2p' : 'group';
  const messageId = message.message_id as string ?? '';
  const messageType = message.message_type as string ?? 'text';

  // Content is a JSON string
  let content = '';
  try {
    const raw = message.content as string ?? '{}';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    content = (parsed.text as string) ?? raw;
  } catch {
    content = message.content as string ?? '';
  }

  // Skip empty messages
  if (!content.trim()) return null;

  // In group chats, skip messages that don't @mention the bot
  // (Feishu includes mentions in the message content as @_user_1 etc.)
  // For now, process all messages; can add mention filtering later

  return {
    eventId,
    messageId,
    chatId,
    chatType,
    senderId,
    senderName,
    messageType,
    content,
    timestamp: Number(header.create_time) || Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Send message via Feishu API
// ---------------------------------------------------------------------------

export async function sendFeishuMessage(
  chatId: string,
  text: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const token = await getTenantToken();

    const resp = await fetch(
      `${FEISHU_API_BASE}/im/v1/messages?receive_id_type=chat_id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
        }),
      },
    );

    const data = await resp.json() as {
      code: number;
      msg: string;
      data?: { message_id?: string };
    };

    if (data.code !== 0) {
      console.error(`[feishu-gw] Send failed: ${data.msg} (code=${data.code})`);
      return { success: false, error: data.msg };
    }

    console.log(`[feishu-gw] Message sent to ${chatId}: ${text.slice(0, 60)}...`);
    return { success: true, messageId: data.data?.message_id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[feishu-gw] Send error: ${error}`);
    return { success: false, error };
  }
}

// ---------------------------------------------------------------------------
// Reply to a message (uses chat_id from inbound)
// ---------------------------------------------------------------------------

export async function replyFeishuMessage(
  messageId: string,
  text: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const token = await getTenantToken();

    const resp = await fetch(
      `${FEISHU_API_BASE}/im/v1/messages/${messageId}/reply`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          msg_type: 'text',
          content: JSON.stringify({ text }),
        }),
      },
    );

    const data = await resp.json() as {
      code: number;
      msg: string;
      data?: { message_id?: string };
    };

    if (data.code !== 0) {
      console.error(`[feishu-gw] Reply failed: ${data.msg} (code=${data.code})`);
      return { success: false, error: data.msg };
    }

    console.log(`[feishu-gw] Reply sent to ${messageId}: ${text.slice(0, 60)}...`);
    return { success: true, messageId: data.data?.message_id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[feishu-gw] Reply error: ${error}`);
    return { success: false, error };
  }
}
