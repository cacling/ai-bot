import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ items: [], total: 0 }),
}));

import { AuditLogPage } from '@/km/AuditLogPage';

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<AuditLogPage />);
    expect(screen.getByText('审计日志')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<AuditLogPage />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows empty state after loading', async () => {
    render(<AuditLogPage />);
    await waitFor(() => {
      expect(screen.getByText('暂无日志')).toBeInTheDocument();
    });
  });

  it('renders table headers', () => {
    render(<AuditLogPage />);
    expect(screen.getByText('动作')).toBeInTheDocument();
    expect(screen.getByText('对象类型')).toBeInTheDocument();
    expect(screen.getByText('操作人')).toBeInTheDocument();
  });
});
