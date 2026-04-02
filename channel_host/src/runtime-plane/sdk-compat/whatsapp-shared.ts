/**
 * openclaw/plugin-sdk/whatsapp-shared compatibility
 *
 * Shared WhatsApp types and utilities used across WhatsApp plugin modules.
 */

// --- Types ---
export type ChannelMessageActionName = string;
export type DmPolicy = 'open' | 'allowlist' | 'closed';
export type GroupPolicy = 'default' | 'restricted' | 'admin-only';

export interface WhatsAppAccountConfig {
  phone?: string;
  allowFrom?: string[];
  defaultTo?: string;
  groupRequireMention?: boolean;
  groupToolPolicy?: string;
  groupIntroHint?: string;
  [key: string]: unknown;
}

// --- Outbound Base Factory ---
export interface WhatsAppOutboundBaseOptions {
  chunker?: (text: string) => string[];
  sendText?: (target: string, text: string) => Promise<unknown>;
  sendMedia?: (target: string, media: unknown) => Promise<unknown>;
  sendPoll?: (target: string, poll: unknown) => Promise<unknown>;
  resolveTarget?: (config: Record<string, unknown>, target?: string) => string;
}

export function createWhatsAppOutboundBase(options: WhatsAppOutboundBaseOptions = {}) {
  return {
    send: async (target: string, payload: unknown) => {
      if (typeof payload === 'string' && options.sendText) {
        return options.sendText(target, payload);
      }
      return { messageId: null, error: 'not-implemented' };
    },
    chunker: options.chunker ?? ((text: string) => [text]),
    resolveTarget: options.resolveTarget ?? ((_cfg: Record<string, unknown>, t?: string) => t ?? ''),
  };
}

// --- Group/Mention Helpers ---
export function resolveWhatsAppGroupIntroHint(config: Record<string, unknown>): string | undefined {
  return config?.groupIntroHint as string | undefined;
}

export function resolveWhatsAppMentionStripRegexes(_config: Record<string, unknown>): RegExp[] {
  return [/@\d+/g];
}

// --- Target Validation ---
export function looksLikeWhatsAppTargetId(target: string): boolean {
  return /^\+?\d{7,15}(@s\.whatsapp\.net)?$/.test(target.trim());
}

// --- Allowlist ---
export function normalizeWhatsAppAllowFromEntries(entries: string[]): string[] {
  return entries.map(e => e.trim().toLowerCase());
}

// --- Messaging Target ---
export function normalizeWhatsAppMessagingTarget(target: string): string {
  const digits = target.replace(/\D/g, '');
  return digits.endsWith('@s.whatsapp.net') ? digits : `${digits}@s.whatsapp.net`;
}

// --- Heartbeat ---
export function resolveWhatsAppHeartbeatRecipients(config: Record<string, unknown>): string[] {
  const r = config?.heartbeatRecipients;
  return Array.isArray(r) ? r : [];
}
