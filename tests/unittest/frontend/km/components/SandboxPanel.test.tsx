import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ id: 'sb-1' }),
}));

import { SandboxPanel } from '@/km/components/SandboxPanel';

describe('SandboxPanel', () => {
  const onClose = vi.fn();

  it('renders without crashing (no sandbox)', () => {
    render(<SandboxPanel filePath="/test.md" onClose={onClose} />);
    expect(screen.getByText('沙箱测试')).toBeInTheDocument();
  });

  it('shows production mode when no sandbox', () => {
    render(<SandboxPanel filePath="/test.md" onClose={onClose} />);
    expect(screen.getByText('生产模式')).toBeInTheDocument();
  });

  it('shows create sandbox button', () => {
    render(<SandboxPanel filePath="/test.md" onClose={onClose} />);
    expect(screen.getByText('创建沙箱')).toBeInTheDocument();
  });

  it('shows sandbox mode with external ID', () => {
    render(<SandboxPanel filePath="/test.md" onClose={onClose} externalSandboxId="sb-1" />);
    expect(screen.getByText('沙箱模式')).toBeInTheDocument();
  });

  it('shows test prompt when sandbox is active', () => {
    render(<SandboxPanel filePath="/test.md" onClose={onClose} externalSandboxId="sb-1" />);
    expect(screen.getByText('发送消息测试当前技能')).toBeInTheDocument();
  });

  it('shows action buttons in sandbox mode', () => {
    render(<SandboxPanel filePath="/test.md" onClose={onClose} externalSandboxId="sb-1" />);
    expect(screen.getByText('校验')).toBeInTheDocument();
    expect(screen.getByText('发布')).toBeInTheDocument();
    expect(screen.getByText('丢弃')).toBeInTheDocument();
  });

  it('shows no file hint when filePath is null', () => {
    render(<SandboxPanel filePath={null} onClose={onClose} />);
    expect(screen.getByText('请先选择文件')).toBeInTheDocument();
  });
});
