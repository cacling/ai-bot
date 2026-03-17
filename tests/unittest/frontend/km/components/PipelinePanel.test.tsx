import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock fetch for VersionPanel/SandboxPanel
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ versions: [] }),
}));

import { PipelinePanel } from '@/km/components/PipelinePanel';

describe('PipelinePanel', () => {
  const defaultProps = {
    filePath: '/test/SKILL.md',
    stage: 'draft' as const,
    autoSaved: true,
    channels: ['online'],
    version: '1.0.0',
    onPublishToSandbox: vi.fn(),
    onPublishDone: vi.fn(),
    onDiscardSandbox: vi.fn(),
    onRollback: vi.fn(),
    saving: false,
    sandboxId: null,
  };

  it('renders without crashing', () => {
    render(<PipelinePanel {...defaultProps} />);
    expect(screen.getByText('发布管道')).toBeInTheDocument();
  });

  it('renders stepper steps', () => {
    render(<PipelinePanel {...defaultProps} />);
    expect(screen.getByText('编辑中')).toBeInTheDocument();
    expect(screen.getByText('沙盒验证')).toBeInTheDocument();
    expect(screen.getByText('已发布')).toBeInTheDocument();
  });

  it('shows publish to sandbox button in draft stage', () => {
    render(<PipelinePanel {...defaultProps} />);
    expect(screen.getByText('发布到沙盒')).toBeInTheDocument();
  });

  it('shows discard button in sandbox stage', () => {
    render(<PipelinePanel {...defaultProps} stage="sandbox" sandboxId="sb-1" />);
    expect(screen.getByText(/放弃沙盒/)).toBeInTheDocument();
  });

  it('shows production status in production stage', () => {
    render(<PipelinePanel {...defaultProps} stage="production" />);
    expect(screen.getByText('已发布到生产')).toBeInTheDocument();
  });

  it('renders channel tags', () => {
    render(<PipelinePanel {...defaultProps} channels={['online', 'voice']} />);
    expect(screen.getByText('online')).toBeInTheDocument();
    expect(screen.getByText('voice')).toBeInTheDocument();
  });

  it('renders version tag', () => {
    render(<PipelinePanel {...defaultProps} version="2.0.0" />);
    expect(screen.getByText('v2.0.0')).toBeInTheDocument();
  });

  it('shows auto-saved status', () => {
    render(<PipelinePanel {...defaultProps} autoSaved={true} />);
    expect(screen.getByText('已自动保存')).toBeInTheDocument();
  });

  it('shows version history toggle', () => {
    render(<PipelinePanel {...defaultProps} />);
    expect(screen.getByText('版本历史')).toBeInTheDocument();
  });
});
