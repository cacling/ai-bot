import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mock MarkdownEditor (depends on Milkdown which needs browser APIs)
vi.mock('@/km/components/MarkdownEditor', () => ({
  MarkdownEditor: ({ content }: { content: string }) =>
    React.createElement('div', { 'data-testid': 'markdown-editor' }, content),
}));

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ tree: [] }),
}));

import { EditorPage } from '@/km/EditorPage';

describe('EditorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<EditorPage />);
    // Should render the file tree header and editor area
    expect(screen.getByText('文件')).toBeInTheDocument();
  });

  it('shows placeholder when no file is selected', () => {
    render(<EditorPage />);
    expect(screen.getByText('请选择一个文件')).toBeInTheDocument();
  });

  it('renders save button', () => {
    render(<EditorPage />);
    expect(screen.getByText('保存')).toBeInTheDocument();
  });

  it('shows empty file hint', () => {
    render(<EditorPage />);
    expect(screen.getByText(/从左侧选择/)).toBeInTheDocument();
  });
});
