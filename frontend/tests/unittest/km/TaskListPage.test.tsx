import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ items: [], total: 0 }),
}));

import { TaskListPage } from '@/km/TaskListPage';

describe('TaskListPage', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<TaskListPage navigate={navigate} />);
    expect(screen.getByText('治理任务')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<TaskListPage navigate={navigate} />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows empty state after loading', async () => {
    render(<TaskListPage navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('暂无任务')).toBeInTheDocument();
    });
  });

  it('renders table headers', () => {
    render(<TaskListPage navigate={navigate} />);
    expect(screen.getByText('类型')).toBeInTheDocument();
    expect(screen.getByText('优先级')).toBeInTheDocument();
    expect(screen.getByText('负责人')).toBeInTheDocument();
  });
});
