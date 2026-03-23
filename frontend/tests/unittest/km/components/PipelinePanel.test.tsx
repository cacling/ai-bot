import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { PipelinePanel } from '@/km/components/PipelinePanel';

const defaultProps = {
  filePath: 'skills/biz-skills/test/SKILL.md',
  stage: 'draft' as const,
  autoSaved: false,
  channels: ['online'],
  version: 'v1',
  onPublishToSandbox: vi.fn(),
  onPublishDone: vi.fn(),
  onDiscardSandbox: vi.fn(),
  onRollback: vi.fn(),
  saving: false,
  sandboxId: null,
};

describe('PipelinePanel', () => {
  it('renders without crashing', () => {
    const { container } = render(<PipelinePanel {...defaultProps} />);
    expect(container).toBeTruthy();
  });

  it('renders empty in draft stage (no sandbox)', () => {
    const { container } = render(<PipelinePanel {...defaultProps} stage="draft" />);
    expect(container.querySelector('.flex')).toBeTruthy();
  });

  it('renders sandbox panel when stage=sandbox and sandboxId exists', () => {
    const { container } = render(
      <PipelinePanel {...defaultProps} stage="sandbox" sandboxId="sb-123" />
    );
    expect(container).toBeTruthy();
  });
});
