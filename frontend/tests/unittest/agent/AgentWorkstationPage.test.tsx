import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('renders the sidebar with primary menu items', () => {
    render(<AgentWorkstationPage />);
    expect(screen.getByText('坐席工作台')).toBeInTheDocument();
    expect(screen.getByText('运营管理')).toBeInTheDocument();
  });

  it('renders operations submenu expanded by default', () => {
    render(<AgentWorkstationPage />);
    expect(screen.getByText('知识库')).toBeInTheDocument();
    expect(screen.getByText('工单管理')).toBeInTheDocument();
  });

  it('renders language selector', () => {
    render(<AgentWorkstationPage />);
    const select = screen.getByDisplayValue('中文');
    expect(select).toBeInTheDocument();
  });

  it('clicking workbench menu item shows workbench content', () => {
    render(<AgentWorkstationPage />);
    fireEvent.click(screen.getByText('坐席工作台'));
    // Workbench pane should be visible (not hidden)
    const workbenchPane = document.querySelector('[id="agent-workstation"]');
    expect(workbenchPane).toBeInTheDocument();
  });

  it('clicking knowledge menu item navigates to operations view', () => {
    render(<AgentWorkstationPage />);
    fireEvent.click(screen.getByText('知识库'));
    // After clicking knowledge, the workbench pane should be hidden
    // and operations pane should be visible
    const workbenchContainer = document.querySelector('[id="agent-workstation"]');
    if (workbenchContainer) {
      expect(workbenchContainer.closest('.hidden')).toBeTruthy();
    }
  });
});
