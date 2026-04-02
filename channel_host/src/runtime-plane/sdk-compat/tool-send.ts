/**
 * openclaw/plugin-sdk/tool-send compatibility
 */

export interface ChannelToolSend {
  channelId: string;
  target: string;
  payload: unknown;
}

export function extractToolSend(_result: unknown): ChannelToolSend | null {
  if (!_result || typeof _result !== 'object') return null;
  const r = _result as Record<string, unknown>;
  if (r.channelId && r.target) {
    return { channelId: String(r.channelId), target: String(r.target), payload: r.payload };
  }
  return null;
}
