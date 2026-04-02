/**
 * openclaw/plugin-sdk/whatsapp-core compatibility
 *
 * WhatsApp-specific core types, config schema builders,
 * and channel config resolvers.
 */
import { z } from 'zod';

// --- Constants ---
export const DEFAULT_ACCOUNT_ID = 'default';

// --- Types ---
export type ChannelPlugin = any;
export type OpenClawConfig = Record<string, unknown>;
export type ToolAuthorizationError = Error;

// --- Config Schema ---
export const WhatsAppConfigSchema = z.object({
  phone: z.string().optional(),
  allowFrom: z.array(z.string()).optional(),
  defaultTo: z.string().optional(),
  groupRequireMention: z.boolean().optional(),
  groupToolPolicy: z.string().optional(),
  groupIntroHint: z.string().optional(),
}).passthrough();

export function buildChannelConfigSchema() {
  return WhatsAppConfigSchema;
}

// --- Channel Meta ---
export function getChatChannelMeta() {
  return {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: '📱',
    supportsMedia: true,
    supportsPolls: true,
    supportsGroups: true,
  };
}

// --- Config Resolvers ---
export function formatWhatsAppConfigAllowFromEntries(entries: string[]): string[] {
  return entries.map(e => e.trim().toLowerCase());
}

export function resolveWhatsAppConfigAllowFrom(config: Record<string, unknown>): string[] {
  const af = config?.allowFrom;
  return Array.isArray(af) ? af : [];
}

export function resolveWhatsAppConfigDefaultTo(config: Record<string, unknown>): string | undefined {
  return config?.defaultTo as string | undefined;
}

export function resolveWhatsAppGroupRequireMention(config: Record<string, unknown>): boolean {
  return config?.groupRequireMention === true;
}

export function resolveWhatsAppGroupToolPolicy(config: Record<string, unknown>): string {
  return (config?.groupToolPolicy as string) ?? 'default';
}

export function resolveWhatsAppGroupIntroHint(config: Record<string, unknown>): string | undefined {
  return config?.groupIntroHint as string | undefined;
}

// --- Action Gate ---
export function createActionGate(_config?: unknown) {
  return {
    check: (_action: string) => true,
    authorize: (_action: string, _ctx: unknown) => true,
  };
}

// --- Utility ---
export function jsonResult(data: unknown) {
  return JSON.stringify(data);
}

export function readReactionParams(params: Record<string, unknown>) {
  return {
    emoji: (params?.emoji as string) ?? '👍',
    messageId: params?.messageId as string,
  };
}

export function readStringParam(params: Record<string, unknown>, key: string): string | undefined {
  const val = params?.[key];
  return typeof val === 'string' ? val : undefined;
}

// --- Outbound Target ---
export function resolveWhatsAppOutboundTarget(config: Record<string, unknown>, target?: string): string {
  return target ?? resolveWhatsAppConfigDefaultTo(config) ?? '';
}

// --- Phone Number Utils ---
export function normalizeE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}
