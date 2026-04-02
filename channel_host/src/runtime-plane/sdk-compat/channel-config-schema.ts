/**
 * openclaw/plugin-sdk/channel-config-schema compatibility
 */
export function buildChannelConfigSchema(_channelId: string, schema?: Record<string, unknown>) {
  return schema ?? { type: 'object', properties: {} };
}
