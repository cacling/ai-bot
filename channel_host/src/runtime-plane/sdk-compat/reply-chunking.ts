/**
 * openclaw/plugin-sdk/reply-chunking compatibility
 */
export type ChunkMode = 'none' | 'sentence' | 'paragraph';
export type ReplyPayload = { text?: string };
export function chunkMarkdownTextWithMode(text: string, _mode?: ChunkMode): string[] { return [text]; }
