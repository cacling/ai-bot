import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockDoc = {
  id: 'doc-1',
  title: '测试文档',
  source: 'manual',
  classification: 'internal',
  owner: 'admin',
  status: 'active',
  versions: [],
  created_at: '2024-01-01T00:00:00',
  updated_at: '2024-01-01T00:00:00',
};

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve(mockDoc),
}));

import { DocumentDetailPage } from '@/km/DocumentDetailPage';

describe('DocumentDetailPage', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<DocumentDetailPage id="doc-1" navigate={navigate} />);
    // Initially shows loading
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows document details after loading', async () => {
    render(<DocumentDetailPage id="doc-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('测试文档')).toBeInTheDocument();
    });
  });

  it('renders back button', async () => {
    render(<DocumentDetailPage id="doc-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('返回列表')).toBeInTheDocument();
    });
  });

  it('shows versions table', async () => {
    render(<DocumentDetailPage id="doc-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('版本列表')).toBeInTheDocument();
      expect(screen.getByText('暂无版本')).toBeInTheDocument();
    });
  });
});
