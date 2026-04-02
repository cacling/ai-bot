/**
 * openclaw/plugin-sdk/media-runtime compatibility
 */
export type PollInput = { question: string; options: string[] };
export type LocalMediaAccessErrorCode = 'not_found' | 'access_denied' | 'unknown';

export function getAgentScopedMediaLocalRoots(..._args: unknown[]): string[] { return []; }
export function normalizePollInput(input: unknown): PollInput | null { return null; }
export function optimizeImageToPng(_buffer: Buffer): Promise<Buffer> { return Promise.resolve(Buffer.alloc(0)); }
export function saveMediaBuffer(..._args: unknown[]): Promise<string> { return Promise.resolve(''); }
export function mediaKindFromMime(mime: string): string {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}
export function renderQrPngBase64(..._args: unknown[]): Promise<string> { return Promise.resolve(''); }
