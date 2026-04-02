/**
 * openclaw/plugin-sdk/testing compatibility
 * Stubs for test-only imports — not needed in production runtime.
 */
export type ChannelAccountSnapshot = Record<string, unknown>;
export type ChannelGatewayContext = Record<string, unknown>;
export function setDefaultChannelPluginRegistryForTests(..._args: unknown[]) {}
export function createWhatsAppPollFixture(..._args: unknown[]) { return {}; }
export function expectChannelInboundContextContract(..._args: unknown[]) {}
export function expectWhatsAppPollSent(..._args: unknown[]) {}
export function installCommonResolveTargetErrorCases(..._args: unknown[]) {}
export function mockPinnedHostnameResolution(..._args: unknown[]) {}
