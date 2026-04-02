/**
 * openclaw/plugin-sdk/cli-runtime compatibility
 */
export const VERSION = '2026.4.1-compat';
export function formatCliCommand(cmd: string): string { return cmd; }
export function waitForever(): Promise<never> { return new Promise(() => {}); }
