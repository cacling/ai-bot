import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock the mermaid module since it needs DOM APIs not available in jsdom
vi.mock('@/shared/mermaid', () => ({
  renderMermaid: vi.fn().mockRejectedValue(new Error('mermaid not available in test')),
}));

import { DiagramContent } from '@/agent/cards/contents/DiagramContent';

describe('DiagramContent', () => {
  it('renders empty state when data is null', () => {
    render(<DiagramContent data={null} lang="zh" />);
    expect(screen.getByText('当前流程没有流程图')).toBeInTheDocument();
  });

  it('renders empty state in English', () => {
    render(<DiagramContent data={null} lang="en" />);
    expect(screen.getByText('No flowchart for current flow')).toBeInTheDocument();
  });

  it('renders empty subtitle', () => {
    render(<DiagramContent data={null} lang="zh" />);
    expect(screen.getByText(/触发网络故障排查等 Skill 后/)).toBeInTheDocument();
  });
});
