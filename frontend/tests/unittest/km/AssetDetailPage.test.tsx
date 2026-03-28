import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockAsset = {
  id: 'asset-1',
  title: '测试资产',
  asset_type: 'faq',
  status: 'online',
  current_version: 1,
  owner: 'admin',
  created_at: '2024-01-01T00:00:00',
  updated_at: '2024-01-01T00:00:00',
};

const mockVersions = { items: [] };

const mockMetrics = {
  total_shown: 120,
  total_used: 45,
  total_edited: 18,
  total_dismissed: 12,
  adopt_rate: 0.375,
  edit_rate: 0.15,
  dismiss_rate: 0.1,
};

vi.stubGlobal('fetch', vi.fn((url: string) => {
  if (typeof url === 'string' && url.includes('/versions')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockVersions),
    });
  }
  if (typeof url === 'string' && url.includes('/metrics')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockMetrics),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(mockAsset),
  });
}));

import { AssetDetailPage } from '@/km/AssetDetailPage';

describe('AssetDetailPage', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<AssetDetailPage id="asset-1" navigate={navigate} />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows asset details after loading', async () => {
    render(<AssetDetailPage id="asset-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('测试资产')).toBeInTheDocument();
    });
  });

  it('renders back button', async () => {
    render(<AssetDetailPage id="asset-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('返回列表')).toBeInTheDocument();
    });
  });

  it('shows version chain section', async () => {
    render(<AssetDetailPage id="asset-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('版本链')).toBeInTheDocument();
    });
  });

  it('shows metrics cards when metrics are loaded', async () => {
    render(<AssetDetailPage id="asset-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('展示次数')).toBeInTheDocument();
      expect(screen.getByText('采纳率')).toBeInTheDocument();
    });
  });
});
