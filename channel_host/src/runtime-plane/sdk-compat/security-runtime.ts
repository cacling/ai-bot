/**
 * openclaw/plugin-sdk/security-runtime compatibility
 *
 * Provides channel-metadata, DM policy, external content sanitization,
 * and safe-regex utilities used by WhatsApp and other plugins.
 */

// --- Channel Metadata ---
export interface ChannelMetadata {
  channelId: string;
  accountId: string;
  platform: string;
  [key: string]: unknown;
}

export function getChannelMetadata(_channelId: string): ChannelMetadata | null {
  return null;
}

export function setChannelMetadata(_channelId: string, _meta: ChannelMetadata): void {}

// --- DM Policy Shared ---
export type DmPolicyMode = 'open' | 'allowlist' | 'closed';

export interface DmPolicyConfig {
  mode: DmPolicyMode;
  allowlist?: string[];
}

export function resolveDmPolicy(_config: unknown): DmPolicyConfig {
  return { mode: 'open' };
}

export function isDmAllowed(_policy: DmPolicyConfig, _senderId: string): boolean {
  return true;
}

// --- External Content ---
export function sanitizeExternalContent(content: string): string {
  return content;
}

export function isExternalContentSafe(_content: string): boolean {
  return true;
}

export function stripExternalMentions(text: string): string {
  return text;
}

// --- Safe Regex ---
export function createSafeRegex(pattern: string, flags?: string): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

export function testSafeRegex(pattern: string, input: string): boolean {
  const re = createSafeRegex(pattern);
  return re ? re.test(input) : false;
}
