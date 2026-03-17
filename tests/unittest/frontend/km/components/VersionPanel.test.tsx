import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ versions: [] }),
}));

import { VersionPanel } from '@/km/components/VersionPanel';

describe('VersionPanel', () => {
  const onClose = vi.fn();
  const onRollback = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing with no file', () => {
    render(<VersionPanel filePath={null} onClose={onClose} />);
    expect(screen.getByText('选择文件后查看版本历史')).toBeInTheDocument();
  });

  it('renders header with file path', () => {
    render(<VersionPanel filePath="/test.md" onClose={onClose} />);
    expect(screen.getByText('版本历史')).toBeInTheDocument();
  });

  it('shows empty state when no versions', async () => {
    render(<VersionPanel filePath="/test.md" onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText('暂无版本记录')).toBeInTheDocument();
    });
  });

  it('renders close button', () => {
    render(<VersionPanel filePath="/test.md" onClose={onClose} />);
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
