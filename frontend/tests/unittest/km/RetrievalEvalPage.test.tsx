import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockCases = {
  items: [
    {
      id: 'case-1',
      input_text: '查询话费',
      input_kind: 'user_message',
      expected_asset_ids: '["a1"]',
      actual_asset_ids: '["a2"]',
      actual_answer: null,
      citation_ok: 1,
      answer_ok: 0,
      reviewer: 'tester',
      created_at: '2024-01-01T00:00:00',
    },
  ],
  total: 1,
};

vi.stubGlobal('fetch', vi.fn((url: string) => {
  if (typeof url === 'string' && url.includes('/cases')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockCases),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ results: [] }),
  });
}));

import { RetrievalEvalPage } from '@/km/RetrievalEvalPage';

describe('RetrievalEvalPage', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<RetrievalEvalPage navigate={navigate} />);
    expect(screen.getByText('检索测试')).toBeInTheDocument();
  });

  it('renders search input and button', () => {
    render(<RetrievalEvalPage navigate={navigate} />);
    expect(screen.getByPlaceholderText('输入客户问题或坐席提问...')).toBeInTheDocument();
    expect(screen.getByText('检索')).toBeInTheDocument();
  });

  it('renders eval cases section', () => {
    render(<RetrievalEvalPage navigate={navigate} />);
    expect(screen.getByText('评测样例')).toBeInTheDocument();
  });

  it('shows eval cases after loading', async () => {
    render(<RetrievalEvalPage navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('查询话费')).toBeInTheDocument();
    });
  });
});
