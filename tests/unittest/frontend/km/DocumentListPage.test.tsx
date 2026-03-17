import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ items: [], total: 0 }),
}));

import { DocumentListPage } from '@/km/DocumentListPage';

describe('DocumentListPage', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<DocumentListPage navigate={navigate} />);
    expect(screen.getByText('文档列表')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<DocumentListPage navigate={navigate} />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows empty state after loading', async () => {
    render(<DocumentListPage navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('暂无文档')).toBeInTheDocument();
    });
  });

  it('renders table headers', () => {
    render(<DocumentListPage navigate={navigate} />);
    expect(screen.getByText('标题')).toBeInTheDocument();
    expect(screen.getByText('来源')).toBeInTheDocument();
    expect(screen.getByText('密级')).toBeInTheDocument();
  });

  it('renders create button', () => {
    render(<DocumentListPage navigate={navigate} />);
    expect(screen.getByText('新建文档')).toBeInTheDocument();
  });
});
