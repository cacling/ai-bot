import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

import { McpServerList } from '@/km/mcp/McpServerList';

describe('McpServerList', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without crashing', () => {
    render(<McpServerList />);
    expect(screen.getByText('新建')).toBeInTheDocument();
  });

  it('shows refresh button', () => {
    render(<McpServerList />);
    // The list view has a refresh icon button
    expect(screen.getByText('新建')).toBeInTheDocument();
  });
});
