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

// Mock fetch
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve([]),
}));

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' });

import App from '@/App';

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<App />);
    // The app should render with tab buttons
    expect(document.querySelector('nav')).toBeInTheDocument();
  });

  it('renders the language selector', () => {
    render(<App />);
    const select = screen.getByDisplayValue('中文');
    expect(select).toBeInTheDocument();
  });

  it('renders tab buttons', () => {
    render(<App />);
    // Chat tab should exist (it's the default in zh)
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('exports nowTime function', async () => {
    const { nowTime } = await import('@/App');
    const time = nowTime();
    expect(typeof time).toBe('string');
    expect(time.length).toBeGreaterThan(0);
  });
});
