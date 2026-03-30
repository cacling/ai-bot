import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock react-router-dom to avoid multi-React-instance issue in bun workspace
vi.mock('react-router-dom', () => ({
  Outlet: () => React.createElement('div', { 'data-testid': 'outlet' }),
  useLocation: () => ({ pathname: '/' }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: any) => React.createElement('a', { href: to }, children),
  MemoryRouter: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

// Mock auth context
vi.mock('@/agent/auth/AuthProvider', () => ({
  useAuth: () => ({ staff: { id: 'test', display_name: 'Test', platform_role: 'admin', staff_roles: ['agent'] }, logout: vi.fn() }),
  AuthProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

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

  it('renders the sidebar navigation', () => {
    render(<AgentWorkstationPage />);
    // Sidebar should render some navigation links
    const links = document.querySelectorAll('a, button');
    expect(links.length).toBeGreaterThan(0);
  });

  it('renders the top bar with user info', () => {
    render(<AgentWorkstationPage />);
    // Should render test user display name from mocked auth
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});
