import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock WebSocket
vi.stubGlobal('WebSocket', vi.fn(() => ({
  send: vi.fn(),
  close: vi.fn(),
  onopen: null,
  onmessage: null,
  onerror: null,
  onclose: null,
  readyState: 1,
  OPEN: 1,
})));

// Mock navigator.mediaDevices
vi.stubGlobal('navigator', {
  ...navigator,
  mediaDevices: {
    getUserMedia: vi.fn().mockRejectedValue(new Error('Not allowed')),
  },
});

// Mock AudioContext
vi.stubGlobal('AudioContext', vi.fn(() => ({
  createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
  createScriptProcessor: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null })),
  createGain: vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn() })),
  close: vi.fn().mockResolvedValue(undefined),
  destination: {},
  sampleRate: 16000,
})));

vi.stubGlobal('MediaSource', vi.fn());
vi.stubGlobal('Audio', vi.fn(() => ({
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  src: '',
})));

import { useVoiceEngine } from '@/chat/hooks/useVoiceEngine';

describe('useVoiceEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with disconnected state by default', () => {
    const { result } = renderHook(() => useVoiceEngine());
    expect(result.current.connState).toBe('disconnected');
    expect(result.current.messages).toEqual([]);
    expect(result.current.errorMsg).toBe('');
    expect(result.current.handoffCtx).toBeNull();
  });

  it('initializes with custom disconnected state', () => {
    const { result } = renderHook(() => useVoiceEngine('idle'));
    expect(result.current.connState).toBe('idle');
  });

  it('provides upsertMsg function', () => {
    const { result } = renderHook(() => useVoiceEngine());
    expect(typeof result.current.upsertMsg).toBe('function');
  });

  it('provides nextMsgId function that increments', () => {
    const { result } = renderHook(() => useVoiceEngine());
    const id1 = result.current.nextMsgId();
    const id2 = result.current.nextMsgId();
    expect(id2).toBeGreaterThan(id1);
  });

  it('provides disconnect function', () => {
    const { result } = renderHook(() => useVoiceEngine());
    expect(typeof result.current.disconnect).toBe('function');
  });

  it('provides reset function that clears state', () => {
    const { result } = renderHook(() => useVoiceEngine());

    act(() => {
      result.current.setMessages([{ id: 1, role: 'user', text: 'hi', time: '10:00' }]);
      result.current.setErrorMsg('some error');
    });

    expect(result.current.messages.length).toBe(1);

    act(() => {
      result.current.reset();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.errorMsg).toBe('');
  });

  it('upsertMsg adds a new message', () => {
    const { result } = renderHook(() => useVoiceEngine());

    act(() => {
      result.current.upsertMsg({ id: 1, role: 'user', text: 'hello', time: '10:00' });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('hello');
  });

  it('upsertMsg updates an existing message by id', () => {
    const { result } = renderHook(() => useVoiceEngine());

    act(() => {
      result.current.upsertMsg({ id: 1, role: 'user', text: 'hello', time: '10:00' });
    });

    act(() => {
      result.current.upsertMsg({ id: 1, role: 'user', text: 'updated', time: '10:01' });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('updated');
  });
});
