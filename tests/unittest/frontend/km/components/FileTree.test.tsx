import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FileTree, type FileNode } from '@/km/components/FileTree';

describe('FileTree', () => {
  const onSelect = vi.fn();

  it('renders loading state', () => {
    render(<FileTree nodes={[]} selectedPath={null} onSelect={onSelect} loading={true} />);
    expect(screen.getByText(/加载中/)).toBeInTheDocument();
  });

  it('renders empty state when no nodes', () => {
    render(<FileTree nodes={[]} selectedPath={null} onSelect={onSelect} loading={false} />);
    expect(screen.getByText(/未找到/)).toBeInTheDocument();
  });

  it('renders file nodes', () => {
    const nodes: FileNode[] = [
      { name: 'test.md', type: 'file', path: '/test.md' },
    ];
    render(<FileTree nodes={nodes} selectedPath={null} onSelect={onSelect} loading={false} />);
    expect(screen.getByText('test.md')).toBeInTheDocument();
  });

  it('renders directory nodes with children', () => {
    const nodes: FileNode[] = [
      {
        name: 'docs',
        type: 'dir',
        path: '/docs',
        children: [
          { name: 'readme.md', type: 'file', path: '/docs/readme.md' },
        ],
      },
    ];
    render(<FileTree nodes={nodes} selectedPath={null} onSelect={onSelect} loading={false} />);
    expect(screen.getByText('docs')).toBeInTheDocument();
    expect(screen.getByText('readme.md')).toBeInTheDocument();
  });

  it('calls onSelect when a file is clicked', () => {
    const nodes: FileNode[] = [
      { name: 'test.md', type: 'file', path: '/test.md' },
    ];
    render(<FileTree nodes={nodes} selectedPath={null} onSelect={onSelect} loading={false} />);
    fireEvent.click(screen.getByText('test.md'));
    expect(onSelect).toHaveBeenCalledWith('/test.md');
  });

  it('highlights the selected file', () => {
    const nodes: FileNode[] = [
      { name: 'test.md', type: 'file', path: '/test.md' },
    ];
    render(<FileTree nodes={nodes} selectedPath="/test.md" onSelect={onSelect} loading={false} />);
    const button = screen.getByText('test.md').closest('button');
    expect(button?.className).toContain('bg-blue-50');
  });
});
