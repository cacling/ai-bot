import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockOverview = {
  total_shown: 100,
  total_used: 40,
  total_dismissed: 15,
  total_not_helpful: 5,
  adopt_rate: 0.4,
  dismiss_rate: 0.15,
  not_helpful_rate: 0.05,
};

const mockDetails = {
  items: [
    {
      id: 'fb-1',
      event_type: 'dismiss',
      feedback_scope: 'reply_hint',
      question_text: '查话费',
      answer_text: '',
      reason_code: null,
      asset_version_id: 'v1',
      created_at: '2024-01-01T00:00:00',
    },
  ],
  total: 1,
};

const mockGaps = {
  items: [
    {
      id: 'gap-0',
      question_text: '如何办理携号转网',
      count: 12,
      latest_at: '2024-01-15T00:00:00',
    },
  ],
};

vi.stubGlobal('fetch', vi.fn((url: string) => {
  if (typeof url === 'string' && url.includes('/overview')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockOverview) });
  }
  if (typeof url === 'string' && url.includes('/gaps')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockGaps) });
  }
  if (typeof url === 'string' && url.includes('/details')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDetails) });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
}));

import { FeedbackDashboardPage } from '@/km/FeedbackDashboardPage';

describe('FeedbackDashboardPage', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<FeedbackDashboardPage navigate={navigate} />);
    expect(screen.getByText('总推荐次数')).toBeInTheDocument();
  });

  it('shows overview metrics after loading', async () => {
    render(<FeedbackDashboardPage navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('100')).toBeInTheDocument();
    });
  });

  it('shows adopt rate as percentage', async () => {
    render(<FeedbackDashboardPage navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('40.0%')).toBeInTheDocument();
    });
  });

  it('renders feedback detail section', async () => {
    render(<FeedbackDashboardPage navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('反馈明细')).toBeInTheDocument();
    });
  });

  it('renders knowledge gap section', async () => {
    render(<FeedbackDashboardPage navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('知识缺口')).toBeInTheDocument();
    });
  });

  it('shows gap question text', async () => {
    render(<FeedbackDashboardPage navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('如何办理携号转网')).toBeInTheDocument();
    });
  });
});
