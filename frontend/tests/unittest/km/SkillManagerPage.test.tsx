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

function installDefaultFetchMock() {
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

});
