import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ items: [], total: 0 }),
}));

import { AssetListPage } from '@/km/AssetListPage';

describe('AssetListPage', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<AssetListPage navigate={navigate} />);
    expect(screen.getByText('发布资产')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<AssetListPage navigate={navigate} />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows empty state after loading', async () => {
    render(<AssetListPage navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('暂无资产')).toBeInTheDocument();
    });
  });

  it('renders table headers', () => {
    render(<AssetListPage navigate={navigate} />);
    expect(screen.getByText('标题')).toBeInTheDocument();
    expect(screen.getByText('类型')).toBeInTheDocument();
    expect(screen.getByText('状态')).toBeInTheDocument();
  });
});
