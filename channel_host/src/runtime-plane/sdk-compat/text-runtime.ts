/**
 * openclaw/plugin-sdk/text-runtime compatibility
 */
export type WebChannel = 'whatsapp' | 'telegram' | 'line' | 'feishu';

export function clamp(val: number, min: number, max: number): number { return Math.min(Math.max(val, min), max); }
export function convertMarkdownTables(text: string, _mode?: string): string { return text; }
export function ensureDir(path: string) { require('fs').mkdirSync(path, { recursive: true }); }
export function getChildLogger(name: string) { return (...args: unknown[]) => console.log(`[${name}]`, ...args); }
export function isSelfChatMode(..._args: unknown[]): boolean { return false; }
export function jidToE164(jid: string): string { return jid.replace(/@.*$/, ''); }
export function logInfo(...args: unknown[]) { console.log('[info]', ...args); }
export function markdownToWhatsApp(text: string): string { return text; }
export function normalizeE164(phone: string): string { return phone.replace(/[^+\d]/g, ''); }
export function redactIdentifier(id: string): string { return id.length <= 4 ? '****' : id.slice(0, 2) + '****' + id.slice(-2); }
export function resolveJidToE164(jid: string): string { return jidToE164(jid); }
export function resolveUserPath(..._args: unknown[]): string { return './data/users'; }
export function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
export function toWhatsappJid(phone: string): string { return `${phone}@s.whatsapp.net`; }
export function stripMarkdown(text: string): string { return text.replace(/[*_~`#]/g, ''); }
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}
