import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mock the API module
vi.mock('@/pages/api', () => ({
  listWorkItems: vi.fn().mockResolvedValue([]),
  getWorkItem: vi.fn().mockResolvedValue({ id: 'WO001', title: 'Test', phone: '138****0001', status: 'open', type: 'ticket', createdAt: '2026-03-29', updatedAt: '2026-03-29' }),
  listIntakes: vi.fn().mockResolvedValue([]),
  getIntake: vi.fn().mockResolvedValue({ id: 'intk_001', source: 'chat', summary: 'Test intake', status: 'new', createdAt: '2026-03-29' }),
  listIssueThreads: vi.fn().mockResolvedValue([]),
  getIssueThread: vi.fn().mockResolvedValue({ id: 'thrd_001', title: 'Test thread', workItemIds: ['WO001'], status: 'open', createdAt: '2026-03-29', updatedAt: '2026-03-29' }),
  listMergeReviews: vi.fn().mockResolvedValue([]),
}));

import { WorkOrderManagementPage } from '@/pages/WorkOrderManagementPage';
import * as api from '@/pages/api';

describe('WorkOrderManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders default tabs', () => {
    render(<WorkOrderManagementPage lang="zh" />);
    expect(screen.getByText('工单列表')).toBeInTheDocument();
    expect(screen.getByText('线索与草稿')).toBeInTheDocument();
    expect(screen.getByText('事项主线')).toBeInTheDocument();
  });

  it('shows empty state when no work items', async () => {
    render(<WorkOrderManagementPage lang="zh" />);
    await waitFor(() => {
      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });
  });

  it('renders work items in table when data is returned', async () => {
    vi.mocked(api.listWorkItems).mockResolvedValueOnce([
      { id: 'WO001', title: 'App登录异常', phone: '138****0001', status: 'open', type: 'ticket', createdAt: '2026-03-29', updatedAt: '2026-03-29 12:30' },
      { id: 'WO002', title: '宽带报修', phone: '138****0002', status: 'scheduled', type: 'workorder', createdAt: '2026-03-29', updatedAt: '2026-03-29 12:10' },
    ]);

    render(<WorkOrderManagementPage lang="zh" />);
    await waitFor(() => {
      expect(screen.getByText('App登录异常')).toBeInTheDocument();
      expect(screen.getByText('宽带报修')).toBeInTheDocument();
    });
  });

  it('renders in English when lang is en', () => {
    render(<WorkOrderManagementPage lang="en" />);
    expect(screen.getByText('Work Items')).toBeInTheDocument();
    expect(screen.getByText('Intakes & Drafts')).toBeInTheDocument();
    expect(screen.getByText('Issue Threads')).toBeInTheDocument();
  });
});
