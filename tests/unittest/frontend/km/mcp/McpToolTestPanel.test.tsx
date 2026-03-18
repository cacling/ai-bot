import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

import { McpToolTestPanel } from '@/km/mcp/McpToolTestPanel';

describe('McpToolTestPanel', () => {
  const defaultProps = {
    server: { id: 's1', name: 'test-server', status: 'available' as const, transport: 'stdio' as const, command: 'node', args: '', env_json: null, tools_json: null, mock_rules_json: null, enabled: 1, created_at: '', updated_at: '' },
    tool: { name: 'test_tool', description: 'A test tool', inputSchema: { type: 'object' as const, properties: {} }, serverId: 's1', serverName: 'test-server' },
    onClose: vi.fn(),
  };

  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without crashing', () => {
    render(<McpToolTestPanel {...defaultProps} />);
    expect(screen.getByText('test_tool')).toBeInTheDocument();
  });

  it('shows call button', () => {
    render(<McpToolTestPanel {...defaultProps} />);
    expect(screen.getByText('调用')).toBeInTheDocument();
  });

  it('shows mode radio for real mode', () => {
    render(<McpToolTestPanel {...defaultProps} />);
    expect(screen.getByText(/Real（调用 MCP）/)).toBeInTheDocument();
  });
});
