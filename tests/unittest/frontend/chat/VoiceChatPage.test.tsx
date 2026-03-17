import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

// Mock MediaSource
vi.stubGlobal('MediaSource', vi.fn());

import { VoiceChatPage } from '@/chat/VoiceChatPage';

describe('VoiceChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<VoiceChatPage />);
    // Should render the voice page container
    const container = document.querySelector('.flex.flex-col');
    expect(container).toBeInTheDocument();
  });

  it('renders empty state when no messages', () => {
    render(<VoiceChatPage />);
    // Should show empty state text
    const emptyState = document.querySelector('.text-center');
    expect(emptyState).toBeInTheDocument();
  });

  it('renders the main action button', () => {
    render(<VoiceChatPage />);
    const button = document.querySelector('button');
    expect(button).toBeInTheDocument();
  });

  it('accepts lang prop', () => {
    render(<VoiceChatPage lang="en" />);
    const container = document.querySelector('.flex.flex-col');
    expect(container).toBeInTheDocument();
  });
});
