/**
 * openclaw/plugin-sdk/channel-pairing compatibility
 */
export function createChannelPairingChallengeIssuer(..._args: unknown[]) {
  return { issue: () => ({ code: '0000', expiresAt: Date.now() + 300000 }) };
}
export function createPairingPrefixStripper(..._args: unknown[]) {
  return (text: string) => text;
}
