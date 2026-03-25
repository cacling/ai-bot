import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockDoc = {
  id: 'doc-1',
  title: '测试文档',
  source: 'manual',
  classification: 'internal',
  owner: 'admin',
  status: 'active',
  versions: [
    {
      id: 'ver-1',
      document_id: 'doc-1',
      version_no: 1,
      file_path: 'data/km-documents/test.md',
      scope_json: null,
      effective_from: '2024-01-01',
      effective_to: null,
      diff_summary: '首版',
      status: 'parsed',
      created_at: '2024-01-01T00:00:00',
    },
  ],
  linked_candidates: [
    {
      id: 'cand-1',
      normalized_q: '测试候选',
      category: '测试分类',
      source_type: 'parsing',
      source_ref_id: 'ver-1',
      status: 'gate_pass',
      risk_level: 'low',
      scene_code: 'test_scene',
      updated_at: '2024-01-01T00:00:00',
    },
  ],
  created_at: '2024-01-01T00:00:00',
  updated_at: '2024-01-01T00:00:00',
};

const mockContent = {
  id: 'ver-1',
  document_id: 'doc-1',
  version_no: 1,
  file_path: 'data/km-documents/test.md',
  resolved_path: '/tmp/test.md',
  format: 'markdown',
  content: '# 测试文档\n\n## 场景\n\n这里是测试正文。',
};

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/documents/versions/ver-1/content')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockContent),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(mockDoc),
  });
}));

import { DocumentDetailPage } from '@/km/DocumentDetailPage';

describe('DocumentDetailPage', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<DocumentDetailPage id="doc-1" navigate={navigate} />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows document details after loading', async () => {
    render(<DocumentDetailPage id="doc-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('测试文档')).toBeInTheDocument();
      expect(screen.getByText('关联候选')).toBeInTheDocument();
      expect(screen.getByText('文档正文')).toBeInTheDocument();
    });
  });

  it('renders markdown view controls', async () => {
    render(<DocumentDetailPage id="doc-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('源码')).toBeInTheDocument();
      expect(screen.getByText('预览')).toBeInTheDocument();
      expect(screen.getByText('分栏')).toBeInTheDocument();
    });
  });

  it('shows linked candidate entry', async () => {
    render(<DocumentDetailPage id="doc-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByText('测试候选')).toBeInTheDocument();
    });
  });

  it('shows markdown source content', async () => {
    render(<DocumentDetailPage id="doc-1" navigate={navigate} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(/# 测试文档/)).toBeInTheDocument();
    });
  });
});
