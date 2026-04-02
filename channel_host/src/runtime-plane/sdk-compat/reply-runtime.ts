/**
 * openclaw/plugin-sdk/reply-runtime compatibility
 */
export type MsgContext = Record<string, unknown>;
export type ReplyPayload = { text?: string; media?: unknown[]; actions?: unknown[] };

export const HEARTBEAT_TOKEN = '__heartbeat__';
export const HEARTBEAT_PROMPT = '';
export const SILENT_REPLY_TOKEN = '__silent__';

export function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit));
  }
  return chunks;
}

export function chunkMarkdownText(text: string, _limit?: number): string[] { return [text]; }
export function dispatchReplyWithBufferedBlockDispatcher(..._args: unknown[]) { return Promise.resolve(); }
export function finalizeInboundContext(..._args: unknown[]) { return {}; }
export function getReplyFromConfig(..._args: unknown[]) { return null; }
export function normalizeGroupActivation(..._args: unknown[]) { return {}; }
export function parseActivationCommand(..._args: unknown[]) { return null; }
export function resetInboundDedupe(..._args: unknown[]) {}
export function resolveChunkMode(..._args: unknown[]) { return 'none'; }
export function resolveHeartbeatReplyPayload(..._args: unknown[]) { return null; }
export function resolveTextChunkLimit(..._args: unknown[]): number { return 4096; }
export function stripHeartbeatToken(text: string): string { return text.replace(HEARTBEAT_TOKEN, ''); }

export function createChannelReplyPipeline(..._args: unknown[]) { return {}; }
export function createReplyPrefixContext(..._args: unknown[]) { return {}; }
export function logTypingFailure(..._args: unknown[]) {}
export function createChannelReplyAdapter(..._args: unknown[]) { return {}; }
