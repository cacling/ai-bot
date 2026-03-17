import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ status: 'ready' }),
}));

import { NLEditPanel } from '@/km/components/NLEditPanel';

describe('NLEditPanel', () => {
  it('renders without crashing', () => {
    render(<NLEditPanel />);
    expect(screen.getByText('AI 编辑')).toBeInTheDocument();
  });

  it('shows empty state hint', () => {
    render(<NLEditPanel />);
    expect(screen.getByText(/输入自然语言描述/)).toBeInTheDocument();
  });

  it('renders reset button', () => {
    render(<NLEditPanel />);
    expect(screen.getByText('重置')).toBeInTheDocument();
  });

  it('renders input textarea', () => {
    render(<NLEditPanel />);
    const textarea = document.querySelector('textarea');
    expect(textarea).toBeInTheDocument();
    expect(textarea?.placeholder).toContain('描述你想做的修改');
  });

  it('renders send button', () => {
    render(<NLEditPanel />);
    const buttons = document.querySelectorAll('button');
    // Should have reset button + send button
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});
