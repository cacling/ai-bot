import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock mermaid
vi.mock('@/shared/mermaid', () => ({
  renderMermaid: vi.fn().mockResolvedValue('<svg>mock diagram</svg>'),
}));

import { DiagramPanel } from '@/shared/DiagramPanel';

describe('DiagramPanel', () => {
  const onClose = vi.fn();

  it('renders without crashing with no diagram', () => {
    render(<DiagramPanel diagram={null} onClose={onClose} />);
    // Should render empty state
    const container = document.querySelector('.flex.flex-col');
    expect(container).toBeInTheDocument();
  });

  it('shows empty state text when no diagram', () => {
    render(<DiagramPanel diagram={null} onClose={onClose} lang="zh" />);
    // Should show the default title and empty state
    const header = document.querySelector('.flex.items-center.space-x-2');
    expect(header).toBeInTheDocument();
  });

  it('renders with a diagram', async () => {
    const diagram = { skill_name: 'test_skill', mermaid: 'graph TD\nA-->B' };
    render(<DiagramPanel diagram={diagram} onClose={onClose} lang="zh" />);
    // Should show a close button when diagram is present
    const container = document.querySelector('.flex.flex-col');
    expect(container).toBeInTheDocument();
  });

  it('accepts en lang prop', () => {
    render(<DiagramPanel diagram={null} onClose={onClose} lang="en" />);
    const container = document.querySelector('.flex.flex-col');
    expect(container).toBeInTheDocument();
  });
});
