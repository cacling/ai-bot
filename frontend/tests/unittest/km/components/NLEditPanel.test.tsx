import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('lucide-react', () => {
  const Icon = () => null;
  return {
    Send: Icon,
    Loader2: Icon,
    Check: Icon,
    X: Icon,
    Sparkles: Icon,
    User: Icon,
    Bot: Icon,
  };
});

import { NLEditPanel } from '@/km/components/NLEditPanel';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function mockJsonResponse(data: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(data),
  };
}

describe('NLEditPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('renders the basic editor shell', () => {
    render(<NLEditPanel />);
    expect(screen.getByText('AI 编辑')).toBeInTheDocument();
    expect(screen.getByText('重置')).toBeInTheDocument();
    expect(screen.getByText(/输入自然语言描述/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/描述你想做的修改/)).toBeInTheDocument();
  });

  it('renders phased clarify details, missing items, options, and repo observations', async () => {
    const onStatusChange = vi.fn();
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      session_id: 'se-clarify',
      status: 'need_clarify',
      phase: 'target_confirm',
      question: '为了继续，请先确认要修改哪个技能。',
      missing: ['目标技能', '具体改动内容'],
      options: [
        { id: 'bill-inquiry', label: 'bill-inquiry', description: '账单查询技能' },
      ],
      summary: {
        target_skill: null,
        change_type: 'wording',
        change_summary: '账单查询话术需要调整，但目标技能未锁定',
        affected_area: [],
        unchanged_area: [],
        related_docs: [],
        acceptance_signal: '',
        risk_level: 'medium',
      },
      evidence: {
        explicit: ['用户说要改账单查询话术'],
        inferred: ['可能是 bill-inquiry'],
        repo_observations: ['已读取 bill-inquiry/SKILL.md，现有工具：query_bill'],
      },
      impact: {
        needs_reference_update: true,
        needs_workflow_change: false,
        needs_channel_review: false,
        needs_human_escalation_review: false,
        out_of_scope_reason: '',
      },
      handoff: {
        ready_for_edit: false,
        target_files: [],
        edit_invariants: [],
      },
    }));

    render(<NLEditPanel onStatusChange={onStatusChange} />);

    fireEvent.change(screen.getByPlaceholderText(/描述你想做的修改/), {
      target: { value: '把账单查询的话术改一下' },
    });
    fireEvent.click(screen.getAllByRole('button').find((btn) => btn.textContent?.includes('重置') === false)!);

    await waitFor(() => {
      expect(screen.getByText('待澄清')).toBeInTheDocument();
    });

    expect(screen.getAllByText('目标技能').length).toBeGreaterThan(0);
    expect(screen.getByText('具体改动内容')).toBeInTheDocument();
    expect(screen.getByText('仓库观察')).toBeInTheDocument();
    expect(screen.getByText('bill-inquiry')).toBeInTheDocument();
    expect(screen.getByText('需要同步 reference')).toBeInTheDocument();
    expect(onStatusChange).toHaveBeenCalledWith(expect.objectContaining({
      status: 'need_clarify',
      phase: 'target_confirm',
    }));
  });

  it('sends quick-reply options back through the same clarify session', async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse({
        session_id: 'se-option',
        status: 'need_clarify',
        phase: 'target_confirm',
        question: '为了继续，请先确认要修改哪个技能。',
        missing: ['目标技能'],
        options: [
          { id: 'bill-inquiry', label: 'bill-inquiry', description: '账单查询技能' },
        ],
        summary: {
          target_skill: null,
          change_type: 'wording',
          change_summary: '目标技能未锁定',
          affected_area: [],
          unchanged_area: [],
          related_docs: [],
          acceptance_signal: '',
          risk_level: 'low',
        },
        evidence: { explicit: [], inferred: [], repo_observations: [] },
        impact: {},
        handoff: { ready_for_edit: false, target_files: [], edit_invariants: [] },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        session_id: 'se-option',
        status: 'need_clarify',
        phase: 'change_confirm',
        question: '这次具体要改哪一段内容？',
        missing: ['具体改动内容'],
        options: [],
        summary: {
          target_skill: 'bill-inquiry',
          change_type: 'wording',
          change_summary: '',
          affected_area: [],
          unchanged_area: [],
          related_docs: [],
          acceptance_signal: '',
          risk_level: 'low',
        },
        evidence: { explicit: [], inferred: [], repo_observations: [] },
        impact: {},
        handoff: { ready_for_edit: false, target_files: ['skills/biz-skills/bill-inquiry/SKILL.md'], edit_invariants: [] },
      }));

    render(<NLEditPanel />);

    fireEvent.change(screen.getByPlaceholderText(/描述你想做的修改/), {
      target: { value: '改一下账单那个技能' },
    });
    fireEvent.click(screen.getAllByRole('button').find((btn) => btn.textContent?.includes('重置') === false)!);

    const optionButton = await screen.findByRole('button', { name: /bill-inquiry/ });
    fireEvent.click(optionButton);

    await waitFor(() => {
      expect(screen.getByText('这次具体要改哪一段内容？')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? '{}'));
    expect(secondCallBody.message).toBe('bill-inquiry');
    expect(secondCallBody.session_id).toBe('se-option');
  });

  it('generates a diff preview after clarify becomes ready', async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse({
        session_id: 'se-ready',
        status: 'ready',
        phase: 'ready',
        question: '',
        missing: [],
        options: [],
        summary: {
          target_skill: 'bill-inquiry',
          change_type: 'wording',
          change_summary: '把账单查询成功后的答复改得更简洁',
          affected_area: ['SKILL.md: 账单结果回复'],
          unchanged_area: ['流程和转人工条件不变'],
          related_docs: [],
          acceptance_signal: '回复更简洁但保留金额和账期信息',
          risk_level: 'low',
        },
        evidence: { explicit: [], inferred: [], repo_observations: [] },
        impact: {},
        handoff: { ready_for_edit: true, target_files: ['skills/biz-skills/bill-inquiry/SKILL.md'], edit_invariants: [] },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        file_path: 'skills/biz-skills/bill-inquiry/SKILL.md',
        old_fragment: 'Old wording that needs change.',
        new_fragment: 'New improved wording.',
        explanation: 'Updated the wording to be clearer.',
      }));

    render(<NLEditPanel />);

    fireEvent.change(screen.getByPlaceholderText(/描述你想做的修改/), {
      target: { value: '把账单查询成功后的答复改得更简洁' },
    });
    fireEvent.click(screen.getAllByRole('button').find((btn) => btn.textContent?.includes('重置') === false)!);

    await waitFor(() => {
      expect(screen.getByText('修改预览')).toBeInTheDocument();
    });

    expect(screen.getByText('skills/biz-skills/bill-inquiry/SKILL.md')).toBeInTheDocument();
    expect(screen.getByText('Old wording that needs change.')).toBeInTheDocument();
    expect(screen.getByText('New improved wording.')).toBeInTheDocument();
  });
});
