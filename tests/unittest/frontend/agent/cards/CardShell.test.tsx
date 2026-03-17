import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CardShell } from '@/agent/cards/CardShell';
import type { CardDef, CardState } from '@/agent/cards/registry';
import { Smile } from 'lucide-react';

function MockContent({ data, lang }: { data: unknown; lang: string }) {
  return <div data-testid="card-content">Content: {JSON.stringify(data)} lang={lang}</div>;
}

function createMockDef(overrides?: Partial<CardDef>): CardDef {
  return {
    id: 'test-card',
    title: { zh: '测试卡片', en: 'Test Card' },
    Icon: Smile,
    headerClass: 'bg-gradient-to-r from-blue-500 to-blue-400',
    colSpan: 1,
    defaultOpen: true,
    defaultCollapsed: false,
    wsEvents: ['test_event'],
    dataExtractor: (msg) => msg.data,
    component: MockContent as any,
    ...overrides,
  };
}

function createMockState(overrides?: Partial<CardState>): CardState {
  return {
    id: 'test-card',
    order: 0,
    isOpen: true,
    isCollapsed: false,
    data: { value: 'test' },
    ...overrides,
  };
}

describe('CardShell', () => {
  const defaultProps = {
    onToggleCollapse: vi.fn(),
    onClose: vi.fn(),
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDrop: vi.fn(),
    isDragging: false,
    isDragOver: false,
  };

  it('renders card title in zh', () => {
    render(
      <CardShell
        def={createMockDef()}
        state={createMockState()}
        lang="zh"
        {...defaultProps}
      />
    );
    expect(screen.getByText('测试卡片')).toBeInTheDocument();
  });

  it('renders card title in en', () => {
    render(
      <CardShell
        def={createMockDef()}
        state={createMockState()}
        lang="en"
        {...defaultProps}
      />
    );
    expect(screen.getByText('Test Card')).toBeInTheDocument();
  });

  it('renders content when not collapsed', () => {
    render(
      <CardShell
        def={createMockDef()}
        state={createMockState({ isCollapsed: false })}
        lang="zh"
        {...defaultProps}
      />
    );
    expect(screen.getByTestId('card-content')).toBeInTheDocument();
  });

  it('hides content when collapsed', () => {
    render(
      <CardShell
        def={createMockDef()}
        state={createMockState({ isCollapsed: true })}
        lang="zh"
        {...defaultProps}
      />
    );
    expect(screen.queryByTestId('card-content')).not.toBeInTheDocument();
  });

  it('calls onToggleCollapse when collapse button is clicked', () => {
    const onToggleCollapse = vi.fn();
    render(
      <CardShell
        def={createMockDef()}
        state={createMockState()}
        lang="zh"
        {...defaultProps}
        onToggleCollapse={onToggleCollapse}
      />
    );
    // The collapse button has title "收起"
    const collapseBtn = screen.getByTitle('收起');
    fireEvent.click(collapseBtn);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <CardShell
        def={createMockDef()}
        state={createMockState()}
        lang="zh"
        {...defaultProps}
        onClose={onClose}
      />
    );
    const closeBtn = screen.getByTitle('关闭');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows expand button title when collapsed', () => {
    render(
      <CardShell
        def={createMockDef()}
        state={createMockState({ isCollapsed: true })}
        lang="zh"
        {...defaultProps}
      />
    );
    expect(screen.getByTitle('展开')).toBeInTheDocument();
  });

  it('passes data and lang to content component', () => {
    render(
      <CardShell
        def={createMockDef()}
        state={createMockState({ data: { foo: 'bar' } })}
        lang="en"
        {...defaultProps}
      />
    );
    const content = screen.getByTestId('card-content');
    expect(content.textContent).toContain('"foo":"bar"');
    expect(content.textContent).toContain('lang=en');
  });
});
