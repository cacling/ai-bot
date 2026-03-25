import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockCandidate = {
  id: 'cand-1',
  normalized_q: '测试问题',
  draft_answer: '测试答案',
  variants_json: JSON.stringify(['测试扩展问']),
  source_type: 'manual',
  risk_level: 'low',
  status: 'draft',
  gate_evidence: 'pending',
  gate_conflict: 'pending',
  gate_ownership: 'pending',
  gate_card: { evidence: { details: [] }, conflict: { details: [] }, ownership: { details: [] } },
  evidences: [],
  target_asset_id: null,
  created_at: '2024-01-01T00:00:00',
  updated_at: '2024-01-01T00:00:00',
};

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve(mockCandidate),
}));

import { CandidateDetailPage } from '@/km/CandidateDetailPage';

describe('CandidateDetailPage', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<CandidateDetailPage id="cand-1" navigate={navigate} />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows candidate details after loading', async () => {
    render(<CandidateDetailPage id="cand-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('测试问题')).toBeInTheDocument();
    });
  });

  it('renders gate check button', async () => {
    render(<CandidateDetailPage id="cand-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('校验门槛')).toBeInTheDocument();
    });
  });

  it('renders back button', async () => {
    render(<CandidateDetailPage id="cand-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('返回列表')).toBeInTheDocument();
    });
  });

  it('shows evidence section', async () => {
    render(<CandidateDetailPage id="cand-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('证据引用')).toBeInTheDocument();
    });
  });
});
