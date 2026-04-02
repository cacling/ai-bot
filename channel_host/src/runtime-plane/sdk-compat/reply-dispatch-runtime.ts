/**
 * openclaw/plugin-sdk/reply-dispatch-runtime compatibility
 */

export type ReplyPayload = { text?: string; media?: unknown; card?: unknown };

export function resolveChunkMode(_config: unknown): 'paragraph' | 'sentence' | 'none' {
  return 'paragraph';
}

export function finalizeInboundContext(_context: unknown): unknown {
  return {};
}

export function dispatchReplyWithBufferedBlockDispatcher(
  _payload: ReplyPayload,
  _dispatcher: unknown,
): Promise<void> {
  return Promise.resolve();
}

export function dispatchReplyWithDispatcher(
  _payload: ReplyPayload,
  _dispatcher: unknown,
): Promise<void> {
  return Promise.resolve();
}
