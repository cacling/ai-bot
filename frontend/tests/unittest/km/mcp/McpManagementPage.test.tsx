import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

import { McpManagementPage } from '@/km/mcp/McpManagementPage';

describe('McpManagementPage', () => {
  it('renders without crashing', () => {
    const { container } = render(<McpManagementPage />);
    expect(container).toBeTruthy();
  });

  it('renders McpServerList', () => {
    const { container } = render(<McpManagementPage />);
    expect(container.querySelector('.flex')).toBeTruthy();
  });
});
