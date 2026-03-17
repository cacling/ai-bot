/**
 * userSync.ts — Cross-window user-switch synchronisation
 *
 * All customer-facing pages (online chat, voice chat, outbound voice) share
 * the same BroadcastChannel so the agent workstation always follows the
 * currently active simulated user without each page duplicating the wiring.
 *
 * Usage:
 *   Sender  (customer page): broadcastUserSwitch(phone)
 *   Receiver (agent page)  : useAgentUserSync(setUserPhone)
 */

import { useEffect, useRef } from 'react';

const CHANNEL = 'ai-bot-user-sync';

/** Broadcast a user-switch event to all open windows/tabs. Fire-and-forget. */
export function broadcastUserSwitch(phone: string): void {
  try {
    new BroadcastChannel(CHANNEL).postMessage({ type: 'user_switch', phone });
  } catch {
    // BroadcastChannel not supported or context destroyed — ignore
  }
}

/**
 * Hook for the agent workstation.
 * Subscribes to user-switch broadcasts and calls `onSwitch` whenever a
 * customer page changes its simulated user.
 *
 * The hook is stable: the BroadcastChannel is created once and closed on
 * unmount. `onSwitch` is accessed via a ref so it never needs to be listed
 * as a dependency.
 */
export function useAgentUserSync(onSwitch: (phone: string) => void): void {
  const onSwitchRef = useRef(onSwitch);
  onSwitchRef.current = onSwitch;

  useEffect(() => {
    const bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (evt) => {
      if (evt.data?.type === 'user_switch' && evt.data.phone) {
        onSwitchRef.current(evt.data.phone as string);
      }
    };
    return () => bc.close();
  }, []); // empty: bc is created once; callback is reached via ref
}
