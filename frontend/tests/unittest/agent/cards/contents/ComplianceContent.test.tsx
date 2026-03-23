import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ComplianceContent } from '@/agent/cards/contents/ComplianceContent';

describe('ComplianceContent', () => {
  it('renders empty state when data is null', () => {
    render(<ComplianceContent data={null} lang="zh" />);
    expect(screen.getByText('暂无合规告警')).toBeInTheDocument();
  });

  it('renders empty state in English', () => {
    render(<ComplianceContent data={null} lang="en" />);
    expect(screen.getByText('No compliance alerts')).toBeInTheDocument();
  });

  it('renders empty state for empty array', () => {
    render(<ComplianceContent data={[]} lang="zh" />);
    expect(screen.getByText('暂无合规告警')).toBeInTheDocument();
  });

  it('renders a single alert with source label in zh', () => {
    const alerts = [
      { source: 'bot', keywords: ['敏感词'], text: '这是一段被检测到的文本', ts: Date.now() },
    ];
    render(<ComplianceContent data={alerts} lang="zh" />);
    expect(screen.getByText('机器人(文字)')).toBeInTheDocument();
    expect(screen.getByText('敏感词')).toBeInTheDocument();
    expect(screen.getByText('这是一段被检测到的文本')).toBeInTheDocument();
  });

  it('renders alert source labels in English', () => {
    const alerts = [
      { source: 'agent', keywords: ['profanity'], text: 'Some flagged text' },
    ];
    render(<ComplianceContent data={alerts} lang="en" />);
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('profanity')).toBeInTheDocument();
  });

  it('renders multiple keywords', () => {
    const alerts = [
      { source: 'bot', keywords: ['词A', '词B', '词C'], text: '测试文本' },
    ];
    render(<ComplianceContent data={alerts} lang="zh" />);
    expect(screen.getByText('词A')).toBeInTheDocument();
    expect(screen.getByText('词B')).toBeInTheDocument();
    expect(screen.getByText('词C')).toBeInTheDocument();
  });

  it('renders at most 10 alerts (most recent)', () => {
    const alerts = Array.from({ length: 15 }, (_, i) => ({
      source: 'bot',
      keywords: [`kw${i}`],
      text: `Alert ${i}`,
      ts: Date.now() + i * 1000,
    }));
    render(<ComplianceContent data={alerts} lang="zh" />);
    // Should show the last 10 (indices 5-14), not the first 5
    expect(screen.queryByText('Alert 4')).not.toBeInTheDocument();
    expect(screen.getByText('Alert 5')).toBeInTheDocument();
    expect(screen.getByText('Alert 14')).toBeInTheDocument();
  });

  it('renders bot_voice source label', () => {
    const alerts = [
      { source: 'bot_voice', keywords: [], text: 'Voice alert' },
    ];
    render(<ComplianceContent data={alerts} lang="zh" />);
    expect(screen.getByText('机器人(语音)')).toBeInTheDocument();
  });

  it('renders model_filter source label in en', () => {
    const alerts = [
      { source: 'model_filter', keywords: [], text: 'Filtered' },
    ];
    render(<ComplianceContent data={alerts} lang="en" />);
    expect(screen.getByText('Model Safety Filter')).toBeInTheDocument();
  });

  it('falls back to raw source string for unknown source', () => {
    const alerts = [
      { source: 'unknown_source', keywords: [], text: 'test' },
    ];
    render(<ComplianceContent data={alerts} lang="zh" />);
    expect(screen.getByText('unknown_source')).toBeInTheDocument();
  });
});
