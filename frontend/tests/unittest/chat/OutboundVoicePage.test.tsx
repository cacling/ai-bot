import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// Mock WebSocket
vi.stubGlobal('WebSocket', vi.fn(() => ({
  send: vi.fn(),
  close: vi.fn(),
  onopen: null,
  onmessage: null,
  onerror: null,
  onclose: null,
  readyState: 1,
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

import { OutboundVoicePage } from '@/chat/OutboundVoicePage';

describe('OutboundVoicePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<OutboundVoicePage />);
    const container = document.querySelector('.flex.flex-col');
    expect(container).toBeInTheDocument();
  });

  it('renders the phone button for starting a call', () => {
    render(<OutboundVoicePage />);
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders empty state when no messages', () => {
    render(<OutboundVoicePage />);
    // The outbound page shows status text in empty state
    const statusText = document.querySelector('.text-center');
    expect(statusText).toBeInTheDocument();
  });

  it('accepts lang and taskType props', () => {
    render(<OutboundVoicePage lang="en" taskType="marketing" />);
    const container = document.querySelector('.flex.flex-col');
    expect(container).toBeInTheDocument();
  });
});
