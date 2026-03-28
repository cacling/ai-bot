import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mock CodeMirror
vi.mock('@uiw/react-codemirror', () => ({
  default: () => React.createElement('div', { 'data-testid': 'codemirror' }),
}));
vi.mock('@codemirror/lang-javascript', () => ({ javascript: () => ({}) }));
vi.mock('@codemirror/lang-python', () => ({ python: () => ({}) }));
vi.mock('@codemirror/lang-json', () => ({ json: () => ({}) }));
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }));
vi.mock('react-markdown', () => ({
  default: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
}));
vi.mock('remark-gfm', () => ({ default: () => undefined }));

const useSkillManagerMock = vi.fn();

vi.mock('@/km/hooks/useSkillManager', () => ({
  useSkillManager: () => useSkillManagerMock(),
  isMdFile: (name: string) => /\.md$/i.test(name),
  isTextFile: () => true,
}));

// Mock SpeechRecognition
(globalThis as any).SpeechRecognition = undefined;
(globalThis as any).webkitSpeechRecognition = undefined;

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
vi.stubGlobal('alert', vi.fn());
vi.stubGlobal('confirm', vi.fn(() => true));

function mockJsonResponse(data: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(data),
  };
}

function buildHookState(overrides: Record<string, unknown> = {}) {
  return {
    view: 'detail',
    skills: [{ id: 'bill-inquiry', description: '账单查询技能' }],
    loading: false,
    loadError: null,
    activeSkill: { id: 'bill-inquiry', description: '账单查询技能' },
    fileTree: [
      {
        name: 'SKILL.md',
        type: 'file',
        path: 'skills/biz-skills/bill-inquiry/SKILL.md',
      },
    ],
    fileTreeLoading: false,
    selectedFile: {
      name: 'SKILL.md',
      type: 'file',
      path: 'skills/biz-skills/bill-inquiry/SKILL.md',
    },
    handleSelectFile: vi.fn(),
    editorContent: '---\nchannels: ["online"]\nversion: "1.0.0"\n---\n',
    handleEditorChange: vi.fn(),
    fileLoading: false,
    saveStatus: 'idle',
    canSave: true,
    isDirty: false,
    viewMode: 'edit',
    setViewMode: vi.fn(),
    handleSave: vi.fn().mockResolvedValue(undefined),
    showUnsavedDialog: false,
    saveAndProceed: vi.fn(),
    confirmDiscard: vi.fn(),
    cancelUnsaved: vi.fn(),
    messages: [],
    inputValue: '',
    setInputValue: vi.fn(),
    isTyping: false,
    messagesEndRef: { current: null },
    handleSubmit: vi.fn((event?: { preventDefault?: () => void }) => event?.preventDefault?.()),
    pendingImage: null,
    setPendingImage: vi.fn(),
    openSkill: vi.fn(),
    requestCloseEditor: vi.fn(),
    createNewSkill: vi.fn(),
    deleteSkill: vi.fn(),
    phase: 'done',
    canPublish: false,
    publishSkill: vi.fn(),
    chatVersionNo: null,
    setChatVersionNo: vi.fn(),
    showThinking: false,
    setShowThinking: vi.fn(),
    ...overrides,
  };
}

function installDefaultFetchMock(extraHandlers?: {
  clarify?: () => ReturnType<typeof mockJsonResponse>;
  diff?: () => ReturnType<typeof mockJsonResponse>;
  apply?: () => ReturnType<typeof mockJsonResponse>;
}) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.startsWith('/api/skill-versions?skill=')) {
      return mockJsonResponse({
        versions: [
          {
            id: 1,
            version_no: 1,
            status: 'published',
            snapshot_path: null,
            change_description: 'published',
            created_at: '2026-03-27T12:00:00Z',
          },
        ],
      });
    }

    if (url.startsWith('/api/skill-versions/') && url.endsWith('/diagram-data')) {
      return mockJsonResponse({});
    }

    if (url.startsWith('/api/test-personas')) {
      return mockJsonResponse([]);
    }

    if (url === '/api/skill-edit/clarify') {
      return extraHandlers?.clarify?.() ?? mockJsonResponse({
        session_id: 'clarify-default',
        status: 'need_clarify',
        phase: 'target_confirm',
        question: '请确认目标技能。',
        missing: ['目标技能'],
        options: [],
        summary: {
          target_skill: null,
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
        handoff: { ready_for_edit: false, target_files: [], edit_invariants: [] },
      });
    }

    if (url === '/api/skill-edit/') {
      return extraHandlers?.diff?.() ?? mockJsonResponse({
        file_path: 'skills/biz-skills/bill-inquiry/SKILL.md',
        old_fragment: '旧内容',
        new_fragment: '新内容',
        session_id: 'clarify-default',
      });
    }

    if (url === '/api/skill-edit/apply') {
      return extraHandlers?.apply?.() ?? mockJsonResponse({ ok: true });
    }

    return mockJsonResponse({});
  });
}

import { SkillManagerPage } from '@/km/SkillManagerPage';

describe('SkillManagerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSkillManagerMock.mockReturnValue(buildHookState());
    installDefaultFetchMock();
  });

  it('renders without crashing', async () => {
    const { container } = render(<SkillManagerPage />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(container).toBeTruthy();
  });

  it('shows the NL edit tab and reflects clarify status back into page chrome', async () => {
    installDefaultFetchMock({
      clarify: () => mockJsonResponse({
        session_id: 'clarify-phase',
        status: 'need_clarify',
        phase: 'impact_confirm',
        question: '这次修改是否会影响升级策略？',
        missing: ['升级策略影响'],
        options: [],
        summary: {
          target_skill: 'bill-inquiry',
          change_type: 'flow',
          change_summary: '修改账单查询后的升级条件',
          affected_area: ['升级分支'],
          unchanged_area: ['查询工具不变'],
          related_docs: [],
          acceptance_signal: '',
          risk_level: 'medium',
        },
        evidence: {
          explicit: ['用户要调整升级条件'],
          inferred: [],
          repo_observations: ['已读取 bill-inquiry/SKILL.md'],
        },
        impact: {
          needs_human_escalation_review: true,
        },
        handoff: {
          ready_for_edit: false,
          target_files: ['skills/biz-skills/bill-inquiry/SKILL.md'],
          edit_invariants: [],
        },
      }),
    });

    render(<SkillManagerPage />);

    fireEvent.click(screen.getByRole('button', { name: /NL 编辑/i }));

    const input = screen.getByPlaceholderText(/描述你想做的修改/);
    fireEvent.change(input, { target: { value: '把账单查询转人工条件改严一点' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await screen.findByText('这次修改是否会影响升级策略？');

    expect(
      screen.getAllByText((_, node) => node?.textContent?.includes('当前阶段：impact_confirm') ?? false).length,
    ).toBeGreaterThan(0);

    expect(
      screen.getAllByText((_, node) => node?.textContent?.includes('当前技能：bill-inquiry') ?? false).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('待澄清').length).toBeGreaterThan(0);
  });

  it('applies an NL edit and reloads the current file', async () => {
    const handleSelectFile = vi.fn();
    useSkillManagerMock.mockReturnValue(buildHookState({ handleSelectFile }));
    installDefaultFetchMock({
      clarify: () => mockJsonResponse({
        session_id: 'clarify-ready',
        status: 'ready',
        phase: 'ready',
        question: '',
        missing: [],
        options: [],
        summary: {
          target_skill: 'bill-inquiry',
          change_type: 'wording',
          change_summary: '把账单查询成功后的答复改得更简洁',
          affected_area: ['结果回复'],
          unchanged_area: ['流程不变'],
          related_docs: [],
          acceptance_signal: '答复更简洁',
          risk_level: 'low',
        },
        evidence: {
          explicit: ['用户要求精简成功回复'],
          inferred: [],
          repo_observations: ['已读取 bill-inquiry/SKILL.md'],
        },
        impact: {},
        handoff: {
          ready_for_edit: true,
          target_files: ['skills/biz-skills/bill-inquiry/SKILL.md'],
          edit_invariants: ['不要修改流程图'],
        },
      }),
      diff: () => mockJsonResponse({
        file_path: 'skills/biz-skills/bill-inquiry/SKILL.md',
        old_fragment: '您好，以下是您的完整账单说明。',
        new_fragment: '这是您的账单结果。',
        session_id: 'clarify-ready',
      }),
      apply: () => mockJsonResponse({ success: true }),
    });

    render(<SkillManagerPage />);

    fireEvent.click(screen.getByRole('button', { name: /NL 编辑/i }));

    const input = screen.getByPlaceholderText(/描述你想做的修改/);
    fireEvent.change(input, { target: { value: '把账单查询成功后的答复改得更简洁' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('修改预览')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /应用/i }));

    await waitFor(() => {
      expect(handleSelectFile).toHaveBeenCalledWith(expect.objectContaining({
        path: 'skills/biz-skills/bill-inquiry/SKILL.md',
      }));
    });
  });

  it('blocks NL edit when the current file has unsaved changes', async () => {
    useSkillManagerMock.mockReturnValue(buildHookState({ isDirty: true }));

    render(<SkillManagerPage />);

    fireEvent.click(screen.getByRole('button', { name: /NL 编辑/i }));

    expect(await screen.findByText(/当前文件有未保存修改/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /先保存当前文件/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/描述你想做的修改/)).not.toBeInTheDocument();
  });
});
