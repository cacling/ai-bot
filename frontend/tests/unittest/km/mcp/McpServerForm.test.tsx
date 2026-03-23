import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

import { McpServerForm } from '@/km/mcp/McpServerForm';

describe('McpServerForm', () => {
  const defaultProps = {
    onBack: vi.fn(),
    onSaved: vi.fn(),
  };

  beforeEach(() => { vi.clearAllMocks(); });

  it('renders create form without crashing', () => {
    const { container } = render(<McpServerForm {...defaultProps} />);
    expect(container).toBeTruthy();
  });

  it('renders form elements', () => {
    const { container } = render(<McpServerForm {...defaultProps} />);
    // Form should have input elements
    expect(container.querySelectorAll('input').length).toBeGreaterThan(0);
  });

  it('renders save button', () => {
    const { container } = render(<McpServerForm {...defaultProps} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
