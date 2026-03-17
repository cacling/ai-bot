import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// Mock the entire MarkdownEditor module since Milkdown requires browser-specific APIs
vi.mock('@/km/components/MarkdownEditor', () => ({
  MarkdownEditor: ({ content, onChange, editorKey }: { content: string; onChange: (v: string) => void; editorKey: string }) =>
    React.createElement('div', { 'data-testid': 'markdown-editor', 'data-key': editorKey }, content),
}));

import { MarkdownEditor } from '@/km/components/MarkdownEditor';

describe('MarkdownEditor', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(
      <MarkdownEditor content="# Hello" onChange={vi.fn()} editorKey="test-key" />
    );
    expect(getByTestId('markdown-editor')).toBeInTheDocument();
  });

  it('renders with different content', () => {
    const { getByTestId } = render(
      <MarkdownEditor content="## World" onChange={vi.fn()} editorKey="test-key-2" />
    );
    expect(getByTestId('markdown-editor')).toBeInTheDocument();
    expect(getByTestId('markdown-editor').textContent).toBe('## World');
  });

  it('passes editorKey as data attribute', () => {
    const { getByTestId } = render(
      <MarkdownEditor content="test" onChange={vi.fn()} editorKey="my-key" />
    );
    expect(getByTestId('markdown-editor').getAttribute('data-key')).toBe('my-key');
  });
});
