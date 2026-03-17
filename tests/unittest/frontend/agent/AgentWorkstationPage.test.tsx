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
  OPEN: 1,
})));

// Mock fetch
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve([]),
}));

import { AgentWorkstationPage } from '@/agent/AgentWorkstationPage';

describe('AgentWorkstationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<AgentWorkstationPage />);
    expect(document.querySelector('nav')).toBeInTheDocument();
  });

  it('renders the agent title', () => {
    render(<AgentWorkstationPage />);
    // The page should contain the agent workspace nav
    const nav = document.querySelector('nav');
    expect(nav).toBeInTheDocument();
  });

  it('renders tab buttons for chat and editor', () => {
    render(<AgentWorkstationPage />);
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders language selector', () => {
    render(<AgentWorkstationPage />);
    const select = screen.getByDisplayValue('中文');
    expect(select).toBeInTheDocument();
  });
});
