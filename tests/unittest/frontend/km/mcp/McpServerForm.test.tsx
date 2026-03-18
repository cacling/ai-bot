import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

import { McpServerForm } from '@/km/mcp/McpServerForm';

describe('McpServerForm', () => {
  const defaultProps = {
    onBack: vi.fn(),
    onSaved: vi.fn(),
  };

  beforeEach(() => { vi.clearAllMocks(); });

  it('renders create form without crashing', () => {
    render(<McpServerForm {...defaultProps} />);
    expect(screen.getByText('保存')).toBeInTheDocument();
  });

  it('shows back button with text', () => {
    render(<McpServerForm {...defaultProps} />);
    expect(screen.getByText(/返回/)).toBeInTheDocument();
  });

  it('renders name input with placeholder', () => {
    render(<McpServerForm {...defaultProps} />);
    expect(screen.getByPlaceholderText('telecom-service')).toBeInTheDocument();
  });
});
