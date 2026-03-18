import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

import { McpManagementPage } from '@/km/mcp/McpManagementPage';

describe('McpManagementPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without crashing', () => {
    render(<McpManagementPage />);
    expect(screen.getByText('MCP 服务')).toBeInTheDocument();
    expect(screen.getByText('工具概览')).toBeInTheDocument();
  });

  it('defaults to servers view', () => {
    render(<McpManagementPage />);
    // The servers tab should be active (has different styling)
    const serversBtn = screen.getByText('MCP 服务');
    expect(serversBtn.className).toContain('border-blue');
  });

  it('switches to overview view on tab click', () => {
    render(<McpManagementPage />);
    fireEvent.click(screen.getByText('工具概览'));
    const overviewBtn = screen.getByText('工具概览');
    expect(overviewBtn.className).toContain('border-blue');
  });
});
