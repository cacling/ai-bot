/**
 * Outbound Bridge
 *
 * Receives outbound commands from ai-bot core (agent replies, notifications)
 * and routes them to the appropriate channel plugin's send adapter.
 *
 * Plugins never receive outbound commands directly — all traffic flows
 * through this bridge.
 */

import type { OutboundCommand, SendResult } from '../types';
import { getChannel } from '../runtime-plane/runtime-registry';
import { sendViaBaileys } from '../runtime-plane/gateway-bridge';
import { emitDiagnostic } from '../control-plane/diagnostics';

// ---------------------------------------------------------------------------
// Outbound Command → Plugin Send
// ---------------------------------------------------------------------------

/**
 * Route an outbound command to the corresponding channel plugin and send it.
 */
export async function handleOutbound(command: OutboundCommand): Promise<SendResult> {
  const channel = getChannel(command.channelId);

  if (!channel) {
    const error = `No channel runtime found for '${command.channelId}'`;
    emitDiagnostic({
      pluginId: command.channelId,
      level: 'error',
      category: 'outbound',
      message: error,
    });
    return {
      success: false,
      channelId: command.channelId,
      error,
    };
  }

  emitDiagnostic({
    pluginId: command.channelId,
    level: 'info',
    category: 'outbound',
    message: `Outbound ${command.messageType} to ${command.externalThreadId} on ${command.channelId}/${command.channelAccountId}`,
    details: {
      threadId: command.externalThreadId,
      messageType: command.messageType,
    },
  });

  try {
    // Prefer live Baileys connection (gateway bridge) for WhatsApp
    const baileysResult = await sendViaBaileys(
      command.channelId,
      command.channelAccountId,
      command.externalThreadId,
      typeof command.payload === 'string' ? command.payload : JSON.stringify(command.payload),
    );
    if (baileysResult.success) {
      return {
        success: true,
        channelId: command.channelId,
        externalMessageId: baileysResult.messageId,
      };
    }

    // Fall back to plugin's registered send adapter
    const result = await dispatchToPlugin(channel.plugin, command);
    return {
      success: true,
      channelId: command.channelId,
      externalMessageId: result?.messageId,
      raw: result,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    emitDiagnostic({
      pluginId: command.channelId,
      level: 'error',
      category: 'outbound',
      message: `Outbound send failed: ${errorMsg}`,
      details: { command },
    });
    return {
      success: false,
      channelId: command.channelId,
      error: errorMsg,
    };
  }
}

// ---------------------------------------------------------------------------
// Plugin dispatch (calls into the opaque ChannelPlugin object)
// ---------------------------------------------------------------------------

interface PluginSendResult {
  messageId?: string;
  [key: string]: unknown;
}

/**
 * Dispatch an outbound command to the plugin's send adapter.
 *
 * OpenClaw channel plugins expose an outbound adapter with a `send` method
 * on the registered ChannelPlugin object. The exact shape varies per plugin,
 * so we probe for common patterns.
 */
async function dispatchToPlugin(
  channelPlugin: unknown,
  command: OutboundCommand,
): Promise<PluginSendResult | undefined> {
  const plugin = channelPlugin as Record<string, unknown>;

  // Pattern 1: plugin.outbound.send(target, payload, options)
  const outbound = plugin?.outbound as Record<string, unknown> | undefined;
  if (outbound && typeof outbound.send === 'function') {
    return await outbound.send(command.externalThreadId, command.payload, {
      accountId: command.channelAccountId,
      messageType: command.messageType,
      metadata: command.metadata,
    });
  }

  // Pattern 2: plugin.send(target, payload)
  if (typeof plugin?.send === 'function') {
    return await (plugin.send as Function)(command.externalThreadId, command.payload);
  }

  // Pattern 3: plugin.sendMessage(target, payload)
  if (typeof plugin?.sendMessage === 'function') {
    return await (plugin.sendMessage as Function)(command.externalThreadId, command.payload);
  }

  throw new Error(
    `Channel plugin for '${command.channelId}' does not expose a recognized send adapter`
  );
}

// ---------------------------------------------------------------------------
// Convenience: send text message
// ---------------------------------------------------------------------------

/**
 * Send a text message to an external thread via a channel.
 * Shorthand for constructing an OutboundCommand.
 */
export async function sendTextMessage(
  channelId: string,
  channelAccountId: string,
  externalThreadId: string,
  text: string,
  metadata?: Record<string, unknown>,
): Promise<SendResult> {
  return handleOutbound({
    channelId,
    channelAccountId,
    externalThreadId,
    messageType: 'text',
    payload: text,
    metadata: metadata ?? {},
  });
}
