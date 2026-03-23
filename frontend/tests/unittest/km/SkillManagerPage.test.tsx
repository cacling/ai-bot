import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
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
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without crashing', () => {
    const { container } = render(<SkillManagerPage />);
    expect(container).toBeTruthy();
  });

  it('renders main container', () => {
    const { container } = render(<SkillManagerPage />);
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('calls fetch on mount for skills list', () => {
    render(<SkillManagerPage />);
    expect(fetch).toHaveBeenCalled();
  });
});
