import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock CodeMirror
vi.mock('@uiw/react-codemirror', () => ({
  default: () => React.createElement('div', { 'data-testid': 'codemirror' }),
}));
vi.mock('@codemirror/lang-javascript', () => ({ javascript: () => ({}) }));
vi.mock('@codemirror/lang-python', () => ({ python: () => ({}) }));
vi.mock('@codemirror/lang-json', () => ({ json: () => ({}) }));
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }));

// Mock SpeechRecognition
(globalThis as any).SpeechRecognition = undefined;
(globalThis as any).webkitSpeechRecognition = undefined;

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ skills: [], items: [] }),
}));

import { SkillManagerPage } from '@/km/SkillManagerPage';

describe('SkillManagerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing (list view)', () => {
    render(<SkillManagerPage />);
    // Default view is 'list'
    expect(screen.getByText(/我的技能库/)).toBeInTheDocument();
  });

  it('renders create button', () => {
    render(<SkillManagerPage />);
    expect(screen.getByText(/新建 SKILL/)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<SkillManagerPage />);
    // Should show some text from the list view
    const container = document.querySelector('.min-h-full');
    expect(container).toBeInTheDocument();
  });
});
