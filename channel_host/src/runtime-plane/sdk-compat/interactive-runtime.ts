/**
 * openclaw/plugin-sdk/interactive-runtime compatibility
 *
 * Interactive reply blocks: buttons, selects, text blocks for rich messaging.
 */

// --- Types ---
export type InteractiveButtonStyle = 'primary' | 'secondary' | 'danger' | 'link';

export interface InteractiveReplyButton {
  label: string;
  style?: InteractiveButtonStyle;
  value?: string;
  url?: string;
}

export interface InteractiveReplyOption {
  label: string;
  value: string;
  description?: string;
}

export interface InteractiveReplySelectBlock {
  type: 'select';
  placeholder?: string;
  options: InteractiveReplyOption[];
}

export interface InteractiveReplyTextBlock {
  type: 'text';
  content: string;
}

export type InteractiveReplyBlock =
  | { type: 'buttons'; buttons: InteractiveReplyButton[] }
  | InteractiveReplySelectBlock
  | InteractiveReplyTextBlock;

export interface InteractiveReply {
  blocks: InteractiveReplyBlock[];
  fallbackText?: string;
}

// --- Functions ---
export function reduceInteractiveReply(reply: InteractiveReply): string {
  return reply.blocks.map(b => {
    if (b.type === 'text') return b.content;
    if (b.type === 'buttons') return b.buttons.map(btn => `[${btn.label}]`).join(' ');
    if (b.type === 'select') return b.options.map(o => o.label).join(' | ');
    return '';
  }).join('\n');
}

export function hasInteractiveReplyBlocks(reply: unknown): boolean {
  return !!(reply && typeof reply === 'object' && 'blocks' in reply &&
    Array.isArray((reply as any).blocks) && (reply as any).blocks.length > 0);
}

export function hasReplyChannelData(reply: unknown): boolean {
  return !!(reply && typeof reply === 'object' && 'channelData' in reply);
}

export function hasReplyContent(reply: unknown): boolean {
  return !!(reply && typeof reply === 'object' &&
    ('text' in reply || 'blocks' in reply || 'media' in reply));
}

export function normalizeInteractiveReply(reply: unknown): InteractiveReply {
  if (hasInteractiveReplyBlocks(reply)) return reply as InteractiveReply;
  return { blocks: [], fallbackText: String(reply ?? '') };
}

export function resolveInteractiveTextFallback(reply: InteractiveReply): string {
  return reply.fallbackText ?? reduceInteractiveReply(reply);
}
