import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { EmotionContent } from '@/agent/cards/contents/EmotionContent';

describe('EmotionContent', () => {
  it('renders empty state when data is null', () => {
    render(<EmotionContent data={null} lang="zh" />);
    expect(screen.getByText('等待客户发言…')).toBeInTheDocument();
  });

  it('renders empty state in English', () => {
    render(<EmotionContent data={null} lang="en" />);
    expect(screen.getByText(/Waiting for customer/)).toBeInTheDocument();
  });

  it('renders emotion label in zh', () => {
    const data = { label: '平静', emoji: '😊', color: 'green' };
    render(<EmotionContent data={data} lang="zh" />);
    expect(screen.getByText(/平静/)).toBeInTheDocument();
  });

  it('renders translated emotion label in en', () => {
    const data = { label: '愤怒', emoji: '😠', color: 'red' };
    render(<EmotionContent data={data} lang="en" />);
    expect(screen.getByText(/Angry/)).toBeInTheDocument();
  });

  it('renders emoji endpoints', () => {
    render(<EmotionContent data={null} lang="zh" />);
    expect(screen.getByText('😊')).toBeInTheDocument();
    expect(screen.getByText('😠')).toBeInTheDocument();
  });

  it('falls back to raw label when emotion key is not in translation map', () => {
    const data = { label: '未知情绪', emoji: '🤔', color: 'amber' };
    render(<EmotionContent data={data} lang="zh" />);
    expect(screen.getByText(/未知情绪/)).toBeInTheDocument();
  });

  it('renders with amber color config', () => {
    const data = { label: '焦虑', emoji: '😰', color: 'amber' };
    render(<EmotionContent data={data} lang="zh" />);
    expect(screen.getByText(/焦虑/)).toBeInTheDocument();
  });

  it('renders with orange color config', () => {
    const data = { label: '不满', emoji: '😤', color: 'orange' };
    render(<EmotionContent data={data} lang="zh" />);
    expect(screen.getByText(/不满/)).toBeInTheDocument();
  });
});
