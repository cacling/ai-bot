import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockPackage = {
  id: 'pkg-1',
  title: '测试评审包',
  status: 'draft',
  risk_level: 'low',
  submitted_by: null,
  candidates: [],
  created_at: '2024-01-01T00:00:00',
  updated_at: '2024-01-01T00:00:00',
};

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve(mockPackage),
}));

import { ReviewPackageDetailPage } from '@/km/ReviewPackageDetailPage';

describe('ReviewPackageDetailPage', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<ReviewPackageDetailPage id="pkg-1" navigate={navigate} />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows package details after loading', async () => {
    render(<ReviewPackageDetailPage id="pkg-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('测试评审包')).toBeInTheDocument();
    });
  });

  it('renders submit button for draft status', async () => {
    render(<ReviewPackageDetailPage id="pkg-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('提交评审')).toBeInTheDocument();
    });
  });

  it('renders back button', async () => {
    render(<ReviewPackageDetailPage id="pkg-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('返回列表')).toBeInTheDocument();
    });
  });

  it('shows candidates section', async () => {
    render(<ReviewPackageDetailPage id="pkg-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('包内候选')).toBeInTheDocument();
    });
  });
});
