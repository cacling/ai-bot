import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

import { ToolsOverviewPanel } from '@/km/mcp/ToolsOverviewPanel';

describe('ToolsOverviewPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders loading state initially', () => {
    render(<ToolsOverviewPanel />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });
});
