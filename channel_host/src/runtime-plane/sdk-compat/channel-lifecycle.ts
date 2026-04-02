/**
 * openclaw/plugin-sdk/channel-lifecycle compatibility
 *
 * Channel lifecycle state machine, draft stream controls, stall watchdog.
 */

// --- Types ---
export type ChannelLifecycleState = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export interface ChannelLifecycleEvent {
  type: string;
  state: ChannelLifecycleState;
  timestamp: number;
}

export interface DraftStreamControls {
  pause: () => void;
  resume: () => void;
  abort: () => void;
  isPaused: () => boolean;
}

export interface StallWatchdogConfig {
  timeoutMs: number;
  onStall: () => void;
}

// --- Core Lifecycle ---
export function createChannelLifecycleMachine(_channelId: string) {
  let state: ChannelLifecycleState = 'idle';
  return {
    getState: () => state,
    transition: (newState: ChannelLifecycleState) => { state = newState; },
    start: () => { state = 'running'; },
    stop: () => { state = 'stopped'; },
  };
}

export function runStateMachine(_config: unknown) {
  return { start: () => {}, stop: () => {}, getState: () => 'idle' as ChannelLifecycleState };
}

// --- Draft Stream ---
export function createDraftStreamControls(): DraftStreamControls {
  let paused = false;
  return {
    pause: () => { paused = true; },
    resume: () => { paused = false; },
    abort: () => {},
    isPaused: () => paused,
  };
}

export function runDraftStreamLoop(_controls: DraftStreamControls, _handler: () => Promise<void>): Promise<void> {
  return Promise.resolve();
}

// --- Stall Watchdog ---
export function createStallWatchdog(config: StallWatchdogConfig) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    start: () => { timer = setTimeout(config.onStall, config.timeoutMs); },
    reset: () => { if (timer) clearTimeout(timer); timer = setTimeout(config.onStall, config.timeoutMs); },
    stop: () => { if (timer) clearTimeout(timer); timer = null; },
  };
}
