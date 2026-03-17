import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ items: [], total: 0 }),
}));

import { ActionDraftListPage } from '@/km/ActionDraftListPage';

describe('ActionDraftListPage', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<ActionDraftListPage navigate={navigate} />);
    expect(screen.getByText('动作草案')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<ActionDraftListPage navigate={navigate} />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows empty state after loading', async () => {
    render(<ActionDraftListPage navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('暂无草案')).toBeInTheDocument();
    });
  });

  it('renders table headers', () => {
    render(<ActionDraftListPage navigate={navigate} />);
    expect(screen.getByText('类型')).toBeInTheDocument();
    expect(screen.getByText('变更摘要')).toBeInTheDocument();
    expect(screen.getByText('状态')).toBeInTheDocument();
  });
});
