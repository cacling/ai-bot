/**
 * Webhook routes — receive inbound messages from IM platforms
 * and route them through the Inbound Bridge.
 */
import { Hono } from 'hono';
import { getChannel } from '../../runtime-plane/runtime-registry';
import { handleInbound, type RawInboundEnvelope } from '../../bridge-plane/inbound-bridge';
import { emitDiagnostic } from '../diagnostics';
import {
  verifyToken,
  handleChallenge,
  parseMessageEvent,
  type FeishuWebhookBody,
} from '../../runtime-plane/feishu-gateway';

export const webhookRoutes = new Hono();

// POST /webhooks/:channelId/:accountId — Receive inbound webhook from IM platform
webhookRoutes.post('/:channelId/:accountId', async (c) => {
  const channelId = c.req.param('channelId');
  const accountId = c.req.param('accountId');

  const channel = getChannel(channelId);
  if (!channel) {
    return c.json({ error: `Channel '${channelId}' not loaded` }, 404);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // Let the plugin's inbound handler parse the platform-specific payload
  // For now, we normalize the common fields directly
  const rawBody = body as Record<string, unknown>;

  const envelope: RawInboundEnvelope = {
    channelId,
    channelAccountId: accountId,
    threadId: (rawBody.threadId ?? rawBody.chatId ?? rawBody.conversationId ?? '') as string,
    senderId: (rawBody.senderId ?? rawBody.from ?? rawBody.userId ?? '') as string,
    text: rawBody.text as string | undefined,
    media: rawBody.media,
    action: rawBody.action,
    metadata: {
      ...(rawBody.metadata as Record<string, unknown> ?? {}),
      rawPlatformPayload: body,
    },
  };

  try {
    const event = await handleInbound(envelope);
    return c.json({
      received: true,
      channelId: event.channelId,
      accountId: event.channelAccountId,
      messageType: event.messageType,
      externalThreadId: event.externalThreadId,
      externalSenderId: event.externalSenderId,
      timestamp: event.timestamp,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    emitDiagnostic({
      pluginId: channelId,
      level: 'error',
      category: 'inbound',
      message: `Webhook processing failed: ${errorMsg}`,
    });
    return c.json({ error: 'Webhook processing failed', detail: errorMsg }, 500);
  }
});

// POST /webhooks/baileys-gateway — Receive forwarded inbound messages from Node.js Baileys gateway
webhookRoutes.post('/baileys-gateway', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const rawBody = body as Record<string, unknown>;
  const envelope: RawInboundEnvelope = {
    channelId: rawBody.channelId as string,
    channelAccountId: rawBody.channelAccountId as string,
    threadId: rawBody.threadId as string,
    senderId: rawBody.senderId as string,
    text: rawBody.text as string | undefined,
    media: rawBody.media,
    metadata: rawBody.metadata as Record<string, unknown>,
    timestamp: rawBody.timestamp as number,
  };

  try {
    const event = await handleInbound(envelope);
    return c.json({ received: true, messageType: event.messageType });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[channel-host] Baileys gateway inbound error:', errorMsg);
    return c.json({ error: errorMsg }, 500);
  }
});

// POST /webhooks/feishu — Receive events from Feishu Open Platform
webhookRoutes.post('/feishu', async (c) => {
  let body: FeishuWebhookBody;
  try {
    body = await c.req.json() as FeishuWebhookBody;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // Verify token
  const token = body.token ?? body.header?.token;
  if (!verifyToken(token)) {
    console.warn('[channel-host] Feishu webhook token mismatch');
    return c.json({ error: 'Invalid token' }, 403);
  }

  // Handle URL verification challenge
  const challenge = handleChallenge(body);
  if (challenge) {
    console.log('[channel-host] Feishu URL verification challenge responded');
    return c.json(challenge);
  }

  // Parse message event
  const msg = parseMessageEvent(body);
  if (!msg) {
    // Not a message event (or duplicate) — ack silently
    return c.json({ ok: true });
  }

  console.log(`[channel-host] Feishu inbound: ${msg.chatType} from ${msg.senderId}, text="${msg.content.slice(0, 50)}"`);

  // Forward to inbound bridge
  const envelope: RawInboundEnvelope = {
    channelId: 'feishu',
    channelAccountId: 'default',
    threadId: msg.chatId,
    senderId: msg.senderId,
    text: msg.content,
    metadata: {
      chatType: msg.chatType,
      messageId: msg.messageId,
      messageType: msg.messageType,
      eventId: msg.eventId,
      senderName: msg.senderName,
    },
    timestamp: msg.timestamp,
  };

  try {
    // Inbound bridge handles: diagnostics, CDP identity resolve, agent call + reply
    const event = await handleInbound(envelope);
    return c.json({ ok: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[channel-host] Feishu webhook error:', errorMsg);
    return c.json({ error: errorMsg }, 500);
  }
});

// GET /webhooks/:channelId/:accountId — Webhook verification (some platforms use GET)
webhookRoutes.get('/:channelId/:accountId', async (c) => {
  const channelId = c.req.param('channelId');
  const accountId = c.req.param('accountId');

  // Handle platform-specific verification challenges
  const challenge = c.req.query('challenge') ?? c.req.query('hub.challenge');
  if (challenge) {
    return c.text(challenge);
  }

  return c.text(`webhook-verify:${channelId}:${accountId}`);
});
