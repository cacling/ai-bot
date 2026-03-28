import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ items: [], total: 0 }),
}));

import { CandidateListPage } from '@/km/CandidateListPage';

describe('CandidateListPage', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<CandidateListPage navigate={navigate} />);
    expect(screen.getByText('助手知识')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<CandidateListPage navigate={navigate} />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows empty state after loading', async () => {
    render(<CandidateListPage navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('暂无知识')).toBeInTheDocument();
    });
  });

  it('renders table headers', () => {
    render(<CandidateListPage navigate={navigate} />);
    expect(screen.getByText('标准问句')).toBeInTheDocument();
    expect(screen.getByText('来源')).toBeInTheDocument();
  });

  it('renders create button', () => {
    render(<CandidateListPage navigate={navigate} />);
    expect(screen.getByText('新建候选')).toBeInTheDocument();
  });
});
