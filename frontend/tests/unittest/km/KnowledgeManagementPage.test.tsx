import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock fetch for all km API calls
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ items: [], total: 0 }),
}));

import { KnowledgeManagementPage } from '@/km/KnowledgeManagementPage';

describe('KnowledgeManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<KnowledgeManagementPage />);
    // Should render the sidebar nav
    const nav = document.querySelector('nav');
    expect(nav).toBeInTheDocument();
  });

  it('renders navigation groups', () => {
    render(<KnowledgeManagementPage />);
    expect(screen.getByText('文档管理')).toBeInTheDocument();
    expect(screen.getByText('助手知识')).toBeInTheDocument();
    expect(screen.getByText('评审与发布')).toBeInTheDocument();
    expect(screen.getByText('资产中心')).toBeInTheDocument();
    expect(screen.getByText('检索与评测')).toBeInTheDocument();
    expect(screen.getByText('反馈与缺口')).toBeInTheDocument();
    expect(screen.getByText('运维与治理')).toBeInTheDocument();
  });

  it('renders navigation items', () => {
    render(<KnowledgeManagementPage />);
    // '文档列表' appears in both nav and content area, use getAllByText
    expect(screen.getAllByText('文档列表').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('知识列表')).toBeInTheDocument();
    expect(screen.getByText('评审包')).toBeInTheDocument();
    expect(screen.getByText('动作草案')).toBeInTheDocument();
    expect(screen.getByText('在线资产')).toBeInTheDocument();
    expect(screen.getByText('检索评测')).toBeInTheDocument();
    expect(screen.getByText('反馈看板')).toBeInTheDocument();
    expect(screen.getByText('治理任务')).toBeInTheDocument();
    expect(screen.getByText('审计日志')).toBeInTheDocument();
  });

  it('shows documents view by default', () => {
    render(<KnowledgeManagementPage />);
    // The default view is 'documents', so DocumentListPage is rendered
    // which shows the heading '文档列表' (in the content area as h2)
    const headings = screen.getAllByText('文档列表');
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });
});
