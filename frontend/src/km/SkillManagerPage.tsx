/**
 * SkillManagerPage.tsx — 技能管理页面（纯视图层）
 *
 * 所有状态与业务逻辑由 useSkillManager hook 管理。
 *
 * 编辑区规则：
 *  - 选中 .md 文件 → textarea 编辑 / 预览 / 分栏
 *  - 选中其他类型  → 只读 <pre> 展示
 *  - 未选中文件   → 空白编辑区（进入技能后自动选中 SKILL.md）
 */

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  Send, Bot, User, FileText, Folder, FileCode,
  ChevronRight, ChevronDown, Sparkles, CheckCircle2, Plus,
  ArrowLeft, AlertCircle, GitBranch,
  Mic, MicOff, Loader2, FlaskConical,
} from 'lucide-react';
import { MermaidRenderer } from '../shared/MermaidRenderer';
import { PipelinePanel, type PipelineStage } from './components/PipelinePanel';
import { InlineMarkdown, SkillCard, SaveIndicator, ViewToggle, UnsavedDialog } from './components/SkillEditorWidgets';
import {
  useSkillManager,
  isMdFile,
  isTextFile,
  type SkillFileNode,
  type ViewMode,
} from './hooks/useSkillManager';

// Phase 标签配色映射
const PHASE_LABELS: Record<string, { label: string; color: string }> = {
  interview: { label: '需求访谈',  color: 'bg-purple-100 text-purple-700' },
  draft:     { label: '生成草稿',  color: 'bg-amber-100 text-amber-700' },
  confirm:   { label: '待确认',   color: 'bg-orange-100 text-orange-700' },
  done:      { label: '已完成',   color: 'bg-green-100 text-green-700' },
};

// ── CodeMirror 语言选择 ───────────────────────────────────────────────────────

function getCodeMirrorLang(name: string) {
  if (/\.(ts|tsx|js|jsx)$/i.test(name)) return javascript({ typescript: true, jsx: true });
  if (/\.py$/i.test(name)) return python();
  if (/\.json$/i.test(name)) return json();
  return undefined;
}

// ── 文件图标 ──────────────────────────────────────────────────────────────────

function FileIcon({ name, type }: { name: string; type: 'file' | 'dir' }) {
  if (type === 'dir') return <Folder className="w-4 h-4 text-blue-400 flex-shrink-0" />;
  if (isMdFile(name)) return <FileText className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
  if (/\.(py|js|ts|sh|bash)$/i.test(name))
    return <FileCode className="w-4 h-4 text-amber-500 flex-shrink-0" />;
  return <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />;
}

// ── 文件树（递归）────────────────────────────────────────────────────────────

interface FileTreeProps {
  nodes: SkillFileNode[];
  selectedPath: string | null;
  onSelect: (node: SkillFileNode) => void;
  dirtyMap?: Map<string, boolean>;
  onCreateFile?: (parentPath: string, name: string) => void;
  onCreateFolder?: (parentPath: string, name: string) => void;
  readOnly?: boolean;
  depth?: number;
}

function InlineCreateInput({ onConfirm, onCancel, placeholder }: { onConfirm: (name: string) => void; onCancel: () => void; placeholder: string }) {
  const [value, setValue] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && value.trim()) { onConfirm(value.trim()); }
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => { if (!value.trim()) onCancel(); }}
      placeholder={placeholder}
      className="w-full px-2 py-0.5 text-xs border border-indigo-300 rounded bg-white outline-none"
    />
  );
}

function FileTreeNode({
  node, selectedPath, onSelect, dirtyMap, onCreateFile, onCreateFolder, readOnly, depth = 0,
}: {
  node: SkillFileNode; selectedPath: string | null; onSelect: (n: SkillFileNode) => void;
  dirtyMap?: Map<string, boolean>; onCreateFile?: (parentPath: string, name: string) => void;
  onCreateFolder?: (parentPath: string, name: string) => void; readOnly?: boolean; depth: number;
}) {
  const [open, setOpen] = React.useState(true);
  const [creating, setCreating] = React.useState<'file' | 'folder' | null>(null);
  const isActive = node.path !== null && node.path === selectedPath;
  const isDir = node.type === 'dir';
  const isClickable = !isDir;

  return (
    <div>
      <div
        onClick={() => { if (isDir) setOpen(o => !o); else onSelect(node); }}
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        className={`group flex items-center gap-1.5 pr-2 py-1 rounded text-sm cursor-pointer select-none
          ${isActive ? 'bg-indigo-100 text-indigo-700 font-medium' : isClickable ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-500 hover:bg-slate-50'}`}
      >
        {isDir && <ChevronRight className={`w-3 h-3 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />}
        {!isDir && <div className="w-3 flex-shrink-0" />}
        <FileIcon name={node.name} type={node.type} />
        <span className="truncate">{node.name}</span>
        {!isDir && node.path && dirtyMap?.has(node.path) && (
          <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ml-auto ${dirtyMap.get(node.path) ? 'bg-amber-400' : 'bg-green-400'}`} />
        )}
        {/* Create button on directories */}
        {isDir && !readOnly && node.path && (
          <button
            onClick={e => { e.stopPropagation(); setCreating(creating ? null : 'file'); setOpen(true); }}
            className="ml-auto opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 transition-opacity"
            title="新建文件/文件夹"
          >
            <Plus size={12} />
          </button>
        )}
      </div>

      {isDir && open && (
        <div className="border-l border-slate-200 ml-5">
          {node.children?.map(child => (
            <FileTreeNode key={child.path ?? child.name} node={child} selectedPath={selectedPath} onSelect={onSelect} dirtyMap={dirtyMap} onCreateFile={onCreateFile} onCreateFolder={onCreateFolder} readOnly={readOnly} depth={depth + 1} />
          ))}
          {/* Inline create input */}
          {creating && node.path && (
            <div className="px-2 py-1 flex items-center gap-1" style={{ paddingLeft: `${(depth + 2) * 12}px` }}>
              <div className="flex gap-1 mb-1">
                <button onClick={() => setCreating('file')} className={`text-[9px] px-1 rounded ${creating === 'file' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400'}`}>文件</button>
                <button onClick={() => setCreating('folder')} className={`text-[9px] px-1 rounded ${creating === 'folder' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400'}`}>文件夹</button>
              </div>
              <InlineCreateInput
                placeholder={creating === 'file' ? '文件名.md' : '文件夹名'}
                onConfirm={name => {
                  if (creating === 'file') onCreateFile?.(node.path!, name);
                  else onCreateFolder?.(node.path!, name);
                  setCreating(null);
                }}
                onCancel={() => setCreating(null)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileTree({ nodes, selectedPath, onSelect, dirtyMap, onCreateFile, onCreateFolder, readOnly, rootPath }: FileTreeProps & { rootPath?: string }) {
  const [rootCreating, setRootCreating] = React.useState<'file' | 'folder' | null>(null);
  return (
    <div className="py-1">
      {nodes.map(node => (
        <FileTreeNode key={node.path ?? node.name} node={node} selectedPath={selectedPath} dirtyMap={dirtyMap} onSelect={onSelect} onCreateFile={onCreateFile} onCreateFolder={onCreateFolder} readOnly={readOnly} depth={0} />
      ))}
      {/* 根级新建 */}
      {!readOnly && rootPath && (
        <div className="px-3 py-1">
          {rootCreating ? (
            <div className="flex items-center gap-1">
              <div className="flex gap-1 mb-1">
                <button onClick={() => setRootCreating('file')} className={`text-[9px] px-1 rounded ${rootCreating === 'file' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400'}`}>文件</button>
                <button onClick={() => setRootCreating('folder')} className={`text-[9px] px-1 rounded ${rootCreating === 'folder' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400'}`}>文件夹</button>
              </div>
              <InlineCreateInput
                placeholder={rootCreating === 'file' ? '文件名.md' : '文件夹名'}
                onConfirm={name => {
                  if (rootCreating === 'file') onCreateFile?.(rootPath, name);
                  else onCreateFolder?.(rootPath, name);
                  setRootCreating(null);
                }}
                onCancel={() => setRootCreating(null)}
              />
            </div>
          ) : (
            <button onClick={() => setRootCreating('file')} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-indigo-600">
              <Plus size={10} /> 新建
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

// ── 语音输入 Hook ─────────────────────────────────────────────────────────────

function useVoiceInput(onTranscript: (text: string) => void) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const toggle = () => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('当前浏览器不支持语音识别（建议使用 Chrome）');
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const rec: SpeechRecognition = new SR();
    rec.lang = 'zh-CN';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join('');
      onTranscript(transcript);
    };
    rec.onerror = () => setIsRecording(false);
    rec.onend = () => setIsRecording(false);

    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  };

  return { isRecording, toggle };
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export function SkillManagerPage() {
  const {
    view,
    skills,
    loading,
    loadError,
    activeSkill,

    fileTree,
    fileTreeLoading,
    selectedFile,
    handleSelectFile,

    editorContent,
    handleEditorChange,
    fileLoading,
    saveStatus,
    canSave,
    isDirty,
    viewMode,
    setViewMode,
    handleSave,

    showUnsavedDialog,
    saveAndProceed,
    confirmDiscard,
    cancelUnsaved,

    messages,
    inputValue,
    setInputValue,
    isTyping,
    messagesEndRef,
    handleSubmit,

    openSkill,
    requestCloseEditor,
    createNewSkill,
    // skill-creator
    phase,
    canPublish,
    publishSkill,
  } = useSkillManager();

  const { isRecording, toggle: toggleVoice } = useVoiceInput((text) => setInputValue(text));

  // ── 文件保存状态跟踪（per-file dirty map）──────────────────────────────────
  // true = 有未保存修改（黄点），false = 已保存（绿点），无 entry = 初始状态（无点）
  const [fileDirtyMap, setFileDirtyMap] = useState<Map<string, boolean>>(new Map());

  // Sync fileDirtyMap when hook's isDirty changes (e.g. draft loaded from server)
  useEffect(() => {
    if (isDirty && selectedFile?.path && !fileDirtyMap.has(selectedFile.path)) {
      setFileDirtyMap(prev => new Map(prev).set(selectedFile.path!, true));
    }
  }, [isDirty, selectedFile, fileDirtyMap]);

  // 当前文件是否有未保存修改（用于保存按钮状态）
  const currentFileDirty = selectedFile?.path ? fileDirtyMap.get(selectedFile.path) === true : false;

  // Mark file dirty when edited
  const handleEditorChangeTracked = useCallback((value: string) => {
    handleEditorChange(value);
    if (selectedFile?.path) {
      setFileDirtyMap(prev => new Map(prev).set(selectedFile.path!, true));
    }
  }, [handleEditorChange, selectedFile]);

  // Manual save — marks file as saved (green dot)
  const handleManualSave = useCallback(async () => {
    await handleSave();
    if (selectedFile?.path) {
      setFileDirtyMap(prev => new Map(prev).set(selectedFile.path!, false));
    }
  }, [handleSave, selectedFile]);

  // ── 版本管理 ────────────────────────────────────────────────────────────────
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>('draft');
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [pipelineSaving, setPipelineSaving] = useState(false);

  interface VersionInfo { id: number; version_no: number; status: string; snapshot_path: string | null; change_description: string | null; created_at: string }
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);
  const [versionFileTree, setVersionFileTree] = useState<typeof fileTree>([]);

  // Reload versions list
  const reloadVersions = useCallback(() => {
    if (!activeSkill) return;
    fetch(`/api/skill-versions?skill=${encodeURIComponent(activeSkill.id)}`)
      .then(r => r.json())
      .then(d => setVersions(d.versions ?? []))
      .catch(() => {});
  }, [activeSkill]);

  // Load version list when skill changes
  useEffect(() => {
    if (!activeSkill) return;
    reloadVersions();
    setViewingVersion(null);
    setSandboxId(null);
    setPipelineStage('draft');
  }, [activeSkill, reloadVersions]);

  // Derive pipeline stage from selected version's status
  const selectedVersion = viewingVersion !== null
    ? versions.find(v => v.version_no === viewingVersion)
    : versions.find(v => v.status === 'published');
  const effectiveStage: PipelineStage = selectedVersion?.status === 'published' ? 'production'
    : pipelineStage === 'sandbox' ? 'sandbox' : 'draft';
  const isPublishedVersion = selectedVersion?.status === 'published';

  // Find SKILL.md node in a tree (recursive)
  function findSkillMd(nodes: SkillFileNode[]): SkillFileNode | null {
    for (const n of nodes) {
      if (n.type === 'file' && n.name === 'SKILL.md') return n;
      if (n.children) { const found = findSkillMd(n.children); if (found) return found; }
    }
    return null;
  }

  // Load version file tree when switching versions, then auto-open SKILL.md
  useEffect(() => {
    if (!activeSkill || viewingVersion === null) { setVersionFileTree([]); return; }
    fetch(`/api/skill-versions/${encodeURIComponent(activeSkill.id)}/${viewingVersion}`)
      .then(r => r.json())
      .then(d => {
        const tree = d.tree ?? [];
        setVersionFileTree(tree);
        // Auto-load SKILL.md
        const skillMd = findSkillMd(tree);
        if (skillMd) {
          handleSelectFile(skillMd);
        }
      })
      .catch(() => setVersionFileTree([]));
  }, [activeSkill, viewingVersion, handleEditorChange]);

  // ── Version actions ───────────────────────────────────────────────────────
  const handleSaveVersion = useCallback(async (versionNo: number) => {
    if (!activeSkill) return;
    await fetch('/api/skill-versions/save-version', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill: activeSkill.id, version_no: versionNo }),
    });
    reloadVersions();
  }, [activeSkill, reloadVersions]);

  const handlePublishVersion = useCallback(async (versionNo: number) => {
    if (!activeSkill) return;
    const res = await fetch('/api/skill-versions/publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill: activeSkill.id, version_no: versionNo }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? '发布失败');
      return;
    }
    reloadVersions();
    // Reload current file if viewing published
    if (selectedFile) handleSelectFile(selectedFile);
  }, [activeSkill, reloadVersions, selectedFile, handleSelectFile]);

  const handleCreateFrom = useCallback(async (fromVersionNo: number) => {
    if (!activeSkill) return;
    const res = await fetch('/api/skill-versions/create-from', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill: activeSkill.id, from_version: fromVersionNo, description: `基于 v${fromVersionNo} 创建` }),
    });
    const data = await res.json();
    reloadVersions();
    if (data.versionNo) setViewingVersion(data.versionNo);
  }, [activeSkill, reloadVersions]);

  // ── 右侧 Tab 切换 + 测试对话 ─────────────────────────────────────────────────
  type RightTab = 'chat' | 'test';
  const [rightTab, setRightTab] = useState<RightTab>('chat');
  const [testingVersion, setTestingVersion] = useState<number | null>(null);
  const [testMessages, setTestMessages] = useState<Array<{ id: number; role: 'user' | 'assistant'; text: string }>>([]);
  const [testInput, setTestInput] = useState('');
  const [testRunning, setTestRunning] = useState(false);
  const [testMode, setTestMode] = useState<'mock' | 'real'>('mock');
  const [testDiagram, setTestDiagram] = useState<{ skill_name: string; mermaid: string } | null>(null);
  const [diagramCollapsed, setDiagramCollapsed] = useState(false);
  const testMsgIdRef = useRef(0);
  const testEndRef = useRef<HTMLDivElement>(null);

  const handleStartTest = useCallback((versionNo: number) => {
    setTestingVersion(versionNo);
    setTestMessages([]);
    setTestInput('');
    setTestDiagram(null);
    setRightTab('test');
  }, []);

  const handleSendTest = useCallback(async () => {
    if (!activeSkill || testingVersion === null || !testInput.trim()) return;
    const userMsg = { id: ++testMsgIdRef.current, role: 'user' as const, text: testInput.trim() };
    setTestMessages(prev => [...prev, userMsg]);
    setTestInput('');
    setTestRunning(true);
    try {
      const res = await fetch('/api/skill-versions/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill: activeSkill.id,
          version_no: testingVersion,
          message: userMsg.text,
          history: testMessages.map(m => ({ role: m.role, content: m.text })),
          useMock: testMode === 'mock',
        }),
      });
      const data = await res.json();
      setTestMessages(prev => [...prev, { id: ++testMsgIdRef.current, role: 'assistant', text: data.text ?? data.error ?? '无返回' }]);
      if (data.skill_diagram) { setTestDiagram(data.skill_diagram); setDiagramCollapsed(false); }
    } catch (e) {
      setTestMessages(prev => [...prev, { id: ++testMsgIdRef.current, role: 'assistant', text: `测试失败: ${e}` }]);
    }
    setTestRunning(false);
  }, [activeSkill, testingVersion, testInput, testMode]);

  useEffect(() => { testEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [testMessages, testRunning]);

  // ── 文件/文件夹创建 ───────────────────────────────────────────────────────
  const handleCreateFile = useCallback(async (parentPath: string, name: string) => {
    const path = `${parentPath}/${name}`;
    const res = await fetch('/api/files/create-file', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? '创建失败'); return; }
    // Reload file tree
    if (viewingVersion !== null && activeSkill) {
      const d = await fetch(`/api/skill-versions/${encodeURIComponent(activeSkill.id)}/${viewingVersion}`).then(r => r.json());
      setVersionFileTree(d.tree ?? []);
    }
    // Auto-select the new file
    handleSelectFile({ name, type: 'file', path });
  }, [viewingVersion, activeSkill, handleSelectFile]);

  const handleCreateFolder = useCallback(async (parentPath: string, name: string) => {
    const path = `${parentPath}/${name}`;
    const res = await fetch('/api/files/create-folder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? '创建失败'); return; }
    // Reload file tree
    if (viewingVersion !== null && activeSkill) {
      const d = await fetch(`/api/skill-versions/${encodeURIComponent(activeSkill.id)}/${viewingVersion}`).then(r => r.json());
      setVersionFileTree(d.tree ?? []);
    }
  }, [viewingVersion, activeSkill]);

  // 从 SKILL.md 内容中解析 channels 和 version
  const parseMetaFromContent = (content: string) => {
    const chMatch = content.match(/channels:\s*\[([^\]]*)\]/);
    const channels = chMatch
      ? chMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      : ['online'];
    const verMatch = content.match(/version:\s*"?([^"\n]+)"?/);
    const version = verMatch?.[1] ?? '1.0.0';
    return { channels, version };
  };
  const meta = parseMetaFromContent(editorContent);

  const handlePublishToSandbox = useCallback(async () => {
    // This is now handled by handleStartSandbox per-version
  }, []);

  const handlePublishDone = useCallback(() => {
    setSandboxId(null);
    setPipelineStage('draft');
    reloadVersions();
  }, [reloadVersions]);

  const handleDiscardSandbox = useCallback(async () => {
    if (sandboxId) {
      try { await fetch(`/api/sandbox/${sandboxId}`, { method: 'DELETE' }); } catch {}
    }
    setSandboxId(null);
    setPipelineStage('draft');
  }, [sandboxId]);

  const handleRollbackDone = useCallback(() => {
    if (selectedFile) handleSelectFile(selectedFile);
    reloadVersions();
  }, [selectedFile, handleSelectFile, reloadVersions]);

  // ── 列表视图 ────────────────────────────────────────────────────────────────
  // Load registry for list view
  const [registry, setRegistry] = useState<Array<{ id: string; published_version: number | null; latest_version: number }>>([]);
  useEffect(() => {
    if (view !== 'list') return;
    fetch('/api/skill-versions/registry').then(r => r.json()).then(d => setRegistry(d.items ?? [])).catch(() => {});
  }, [view]);

  if (view === 'list') {
    return (
      <div className="h-full bg-white overflow-y-auto">
        <div className="px-6 py-4">
          {/* 头部 */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">技能列表 ({skills.length})</h2>
            <button
              onClick={createNewSkill}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              <Plus size={13} /> 新建
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">加载中…</span>
            </div>
          )}
          {!loading && loadError && (
            <div className="flex items-center gap-2 text-red-500 text-sm py-8">
              <AlertCircle className="w-4 h-4" /> {loadError}
            </div>
          )}
          {!loading && !loadError && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500 text-xs">
                    <th className="px-4 py-2.5 font-medium">名称</th>
                    <th className="px-4 py-2.5 font-medium">描述</th>
                    <th className="px-4 py-2.5 font-medium w-20">发布版本</th>
                    <th className="px-4 py-2.5 font-medium w-24">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map(skill => {
                    const reg = registry.find(r => r.id === skill.id);
                    return (
                      <tr
                        key={skill.id}
                        className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition"
                        onClick={() => openSkill(skill)}
                      >
                        <td className="px-4 py-2.5 font-mono text-slate-800 font-medium">{skill.id}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs truncate max-w-[300px]">{skill.description}</td>
                        <td className="px-4 py-2.5">
                          {reg?.published_version ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-600">v{reg.published_version}</span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <button onClick={() => openSkill(skill)} className="text-xs text-indigo-600 hover:text-indigo-800">编辑</button>
                            <button
                              onClick={() => {
                                if (confirm(`确定删除技能 ${skill.id}？`)) {
                                  // TODO: implement delete API
                                  alert('删除功能开发中');
                                }
                              }}
                              className="text-xs text-red-500 hover:text-red-700"
                            >删除</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {skills.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-slate-400 text-sm">
                        暂无技能，点击「新建」开始创建
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 编辑器视图 ──────────────────────────────────────────────────────────────

  const selectedIsMd = selectedFile ? isMdFile(selectedFile.name) : false;

  return (
    <div className="h-full w-full flex bg-slate-50 overflow-hidden relative">

      {/* ── 未保存对话框 ── */}
      {showUnsavedDialog && (
        <UnsavedDialog
          onCancel={cancelUnsaved}
          onDiscard={confirmDiscard}
          onSave={saveAndProceed}
        />
      )}

      {/* ── 右侧栏：需求访谈 / 测试（双 Tab） ── */}
      <div className="w-[360px] flex-shrink-0 flex flex-col border-l border-slate-200 bg-white shadow-sm" style={{ order: 99 }}>

        {/* Tab 头部 */}
        <div className="h-10 border-b border-slate-200 flex items-center shrink-0">
          <button
            onClick={() => setRightTab('chat')}
            className={`flex items-center gap-1.5 px-4 h-full text-xs font-medium border-b-2 transition-colors ${
              rightTab === 'chat' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> 需求访谈
          </button>
          <button
            onClick={() => setRightTab('test')}
            className={`flex items-center gap-1.5 px-4 h-full text-xs font-medium border-b-2 transition-colors ${
              rightTab === 'test' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" /> 测试{testingVersion !== null ? ` v${testingVersion}` : ''}
          </button>
        </div>

        {/* ── 需求访谈 Tab ── */}
        {rightTab === 'chat' && (
          <>
            <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-slate-50/50">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'}`}>
                    <InlineMarkdown text={msg.text} />
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><Bot className="w-3.5 h-3.5" /></div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-3 py-2 flex items-center gap-1 shadow-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" />
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0.2s' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-3 bg-white border-t border-slate-200">
              <form onSubmit={handleSubmit}>
                <div className="rounded-xl border border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 bg-slate-50 transition-all overflow-hidden">
                  <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (inputValue.trim() && !isTyping) handleSubmit(e as any); } }}
                    placeholder="描述需求或补充修改…（Enter 发送，Shift+Enter 换行）"
                    rows={3}
                    className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 outline-none text-xs text-slate-800 placeholder:text-slate-400 leading-relaxed"
                    spellCheck={false}
                  />
                  <div className="flex items-center justify-between px-2 pb-2">
                    <button type="button" onClick={toggleVoice} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${isRecording ? 'bg-red-50 text-red-500 animate-pulse' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
                      {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      {isRecording ? '停止' : '语音'}
                    </button>
                    <button type="submit" disabled={!inputValue.trim() || isTyping} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </>
        )}

        {/* ── 测试 Tab ── */}
        {rightTab === 'test' && (
          <>
            <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-slate-50/50">
              {testingVersion === null ? (
                <div className="flex items-center justify-center h-full text-sm text-slate-400">
                  在版本列表中点击 [测试] 开始
                </div>
              ) : testMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-slate-400">
                  输入消息开始测试 v{testingVersion}
                </div>
              ) : (
                <>
                  {testMessages.map((msg) => (
                    <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                      </div>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'}`}>
                        <InlineMarkdown text={msg.text} />
                      </div>
                    </div>
                  ))}
                  {testRunning && (
                    <div className="flex gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><Bot className="w-3.5 h-3.5" /></div>
                      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-3 py-2 flex items-center gap-1 shadow-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" />
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={testEndRef} />
            </div>
            {testingVersion !== null && (
              <div className="p-3 bg-white border-t border-slate-200 space-y-2">
                {/* Mock / Real 模式切换 */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input type="radio" name="testMode" checked={testMode === 'mock'} onChange={() => setTestMode('mock')} className="w-3 h-3" />
                    Mock
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input type="radio" name="testMode" checked={testMode === 'real'} onChange={() => setTestMode('real')} className="w-3 h-3" />
                    Real
                  </label>
                  <span className="text-[10px] text-slate-400">{testMode === 'mock' ? '工具调用走 Mock 规则' : '工具调用走真实 MCP'}</span>
                </div>
                <div className="rounded-xl border border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 bg-slate-50 transition-all overflow-hidden">
                  <textarea
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendTest(); } }}
                    placeholder="输入测试消息…（Enter 发送）"
                    rows={3}
                    className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 outline-none text-xs text-slate-800 placeholder:text-slate-400 leading-relaxed"
                    spellCheck={false}
                  />
                  <div className="flex items-center justify-between px-2 pb-2">
                    <button type="button" onClick={toggleVoice} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${isRecording ? 'bg-red-50 text-red-500 animate-pulse' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
                      {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      {isRecording ? '停止' : '语音'}
                    </button>
                    <button type="button" onClick={handleSendTest} disabled={!testInput.trim() || testRunning} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 左列：返回 → 版本 → 文件树 → 测试区 ── */}
      <div className="w-56 flex-shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col overflow-hidden" style={{ order: 1 }}>

        {/* 返回按钮 + 技能名 */}
        <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2">
          <button onClick={requestCloseEditor} className="text-slate-400 hover:text-slate-600">
            <ArrowLeft size={14} />
          </button>
          <span className="text-xs font-semibold text-slate-700 truncate">{activeSkill?.name ?? ''}</span>
        </div>

        {/* 版本列表 */}
        {versions.length > 0 && (
          <div className="border-b border-slate-200">
            <div className="px-3 py-1.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">版本</span>
              <button
                onClick={() => {
                  const base = viewingVersion ?? versions.find(v => v.status === 'published')?.version_no ?? versions[0]?.version_no;
                  if (base) handleCreateFrom(base);
                }}
                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium"
              >
                + 新版本
              </button>
            </div>
            <div className="pb-1">
              {versions.map(v => {
                const isActive = viewingVersion === null
                  ? v.status === 'published'
                  : viewingVersion === v.version_no;
                return (
                  <div
                    key={v.id}
                    onClick={() => setViewingVersion(v.version_no)}
                    className={`group flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer transition ${
                      isActive ? 'bg-amber-50 border-l-2 border-amber-400' : 'hover:bg-slate-100'
                    }`}
                  >
                    <span className={`font-mono flex-shrink-0 ${isActive ? 'text-amber-700 font-semibold' : 'text-slate-600'}`}>
                      v{v.version_no}
                    </span>
                    {v.status === 'published' && <span className="px-1 py-0.5 rounded text-[9px] bg-green-100 text-green-600 flex-shrink-0">已发布</span>}
                    {v.status !== 'published' && <span className="px-1 py-0.5 rounded text-[9px] bg-blue-100 text-blue-600 flex-shrink-0">已保存</span>}

                    {/* 操作按钮：默认隐藏，hover 显示 */}
                    {v.status !== 'published' && (
                      <div className="ml-auto flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); handleStartTest(v.version_no); }}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500 text-white hover:bg-indigo-600">测试</button>
                        <button onClick={(e) => { e.stopPropagation(); handlePublishVersion(v.version_no); }}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-green-500 text-white hover:bg-green-600">发布</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 文件树（无标题，用分隔线区分） */}
        <div className="min-h-[20%]">
          <div className="overflow-y-auto">
            {fileTreeLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400 gap-1.5">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">加载中…</span>
              </div>
            ) : viewingVersion !== null ? (
              /* 版本快照的文件树 */
              versionFileTree.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-slate-400 gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">加载中…</span>
                </div>
              ) : (
                <FileTree
                  nodes={versionFileTree}
                  selectedPath={selectedFile?.path ?? null}
                  dirtyMap={fileDirtyMap}
                  onSelect={handleSelectFile}
                  onCreateFile={!isPublishedVersion ? handleCreateFile : undefined}
                  onCreateFolder={!isPublishedVersion ? handleCreateFolder : undefined}
                  readOnly={isPublishedVersion}
                  rootPath={!isPublishedVersion && selectedVersion?.snapshot_path ? `skills/${selectedVersion.snapshot_path}` : undefined}
                />
              )
            ) : (
              <FileTree
                nodes={fileTree}
                selectedPath={selectedFile?.path ?? null}
                dirtyMap={fileDirtyMap}
                onSelect={handleSelectFile}
                readOnly
              />
            )}
          </div>
        </div>

      </div>

      {/* ── 中间：编辑区（全宽）── */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden" style={{ order: 2 }}>

        {/* 工具栏 */}
        <div className="h-10 border-b border-slate-200 flex items-center justify-between px-3 shrink-0">
          <span className="text-xs text-slate-500 truncate">
            {selectedFile ? selectedFile.name : ''}
          </span>
          <div className="flex items-center gap-2">
            {/* 保存按钮（发布版本不显示） */}
            {!isPublishedVersion && (
              <button
                onClick={handleManualSave}
                disabled={!currentFileDirty || !canSave}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition ${
                  currentFileDirty && canSave
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                保存
              </button>
            )}
            {selectedIsMd && (
              <ViewToggle viewMode={viewMode} onChange={setViewMode} />
            )}
            {/* 版本状态标签 */}
            {selectedVersion && (
              <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${
                selectedVersion.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
              }`}>
                v{selectedVersion.version_no} {selectedVersion.status === 'published' ? '已发布' : '已保存'}
              </span>
            )}
          </div>
        </div>

        {/* 发布版本只读提示 */}
        {isPublishedVersion && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
            当前为发布版本，不可编辑。如需修改请基于此版本创建新版本，或将其他版本设为发布后再编辑。
          </div>
        )}

        {/* 编辑器内容区 */}
        <div className="flex-1 overflow-hidden">

          {fileLoading && (
            <div className="flex items-center justify-center h-full text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">加载中…</span>
            </div>
          )}

          {!fileLoading && selectedFile && selectedIsMd && viewMode === 'edit' && (
            <textarea
              className={`w-full h-full resize-none font-mono text-sm leading-relaxed p-4 outline-none ${isPublishedVersion ? 'bg-slate-50 text-slate-500' : 'bg-white text-slate-800'}`}
              readOnly={isPublishedVersion}
              value={editorContent}
              onChange={(e) => !isPublishedVersion && handleEditorChangeTracked(e.target.value)}
              spellCheck={false}
            />
          )}

          {!fileLoading && selectedFile && selectedIsMd && viewMode === 'preview' && (
            <div className="h-full overflow-y-auto px-6 py-4 prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{editorContent}</ReactMarkdown>
            </div>
          )}

          {!fileLoading && selectedFile && !selectedIsMd && isTextFile(selectedFile.name) && (
            <div className="h-full overflow-auto">
              <CodeMirror
                value={editorContent}
                height="100%"
                theme={oneDark}
                extensions={getCodeMirrorLang(selectedFile.name)
                  ? [getCodeMirrorLang(selectedFile.name)!]
                  : []}
                onChange={isPublishedVersion ? undefined : handleEditorChangeTracked}
                readOnly={isPublishedVersion}
                basicSetup={{ lineNumbers: true, foldGutter: true }}
                style={{ fontSize: '13px', height: '100%' }}
              />
            </div>
          )}

          {!fileLoading && selectedFile && !selectedIsMd && !isTextFile(selectedFile.name) && (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm gap-2">
              <AlertCircle size={16} />
              不支持预览此文件类型
            </div>
          )}
        </div>

        {/* ── 测试流程图（测试时展开，非测试时隐藏）── */}
        {testingVersion !== null && testDiagram && (
          <div className="border-t border-slate-200 shrink-0">
            <button
              onClick={() => setDiagramCollapsed(prev => !prev)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {diagramCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              <GitBranch size={12} />
              流程图 — {testDiagram.skill_name}
            </button>
            {!diagramCollapsed && (
              <div className="px-3 pb-3">
                <MermaidRenderer
                  mermaid={testDiagram.mermaid}
                  height="35vh"
                  zoom={true}
                  autoFocus={true}
                  emptyText="暂无流程图"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
