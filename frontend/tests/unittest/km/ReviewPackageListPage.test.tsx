import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ items: [], total: 0 }),
}));

import { ReviewPackageListPage } from '@/km/ReviewPackageListPage';

describe('ReviewPackageListPage', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<ReviewPackageListPage navigate={navigate} />);
    expect(screen.getByText('评审包')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<ReviewPackageListPage navigate={navigate} />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows empty state after loading', async () => {
    render(<ReviewPackageListPage navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('暂无评审包')).toBeInTheDocument();
    });
  });

  it('renders table headers', () => {
    render(<ReviewPackageListPage navigate={navigate} />);
    expect(screen.getByText('标题')).toBeInTheDocument();
    expect(screen.getByText('状态')).toBeInTheDocument();
  });

  it('renders create button', () => {
    render(<ReviewPackageListPage navigate={navigate} />);
    expect(screen.getByText('新建评审包')).toBeInTheDocument();
  });
});
