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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
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
  interview: { label: '需求访谈',  color: 'bg-secondary text-secondary-foreground' },
  draft:     { label: '生成草稿',  color: 'bg-secondary text-secondary-foreground' },
  confirm:   { label: '待确认',   color: 'bg-secondary text-secondary-foreground' },
  done:      { label: '已完成',   color: 'bg-secondary text-secondary-foreground' },
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
  if (type === 'dir') return <Folder className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
  if (isMdFile(name)) return <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
  if (/\.(py|js|ts|sh|bash)$/i.test(name))
    return <FileCode className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
  return <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
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
      className="w-full px-2 py-0.5 text-xs border border-ring rounded bg-background outline-none"
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
          ${isActive ? 'bg-accent text-primary font-medium' : isClickable ? 'text-foreground/70 hover:bg-muted' : 'text-muted-foreground hover:bg-muted'}`}
      >
        {isDir && <ChevronRight className={`w-3 h-3 text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />}
        {!isDir && <div className="w-3 flex-shrink-0" />}
        <FileIcon name={node.name} type={node.type} />
        <span className="truncate">{node.name}</span>
        {!isDir && node.path && dirtyMap?.has(node.path) && (
          <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ml-auto ${dirtyMap.get(node.path) ? 'bg-primary' : 'bg-muted-foreground'}`} />
        )}
        {/* Create button on directories */}
        {isDir && !readOnly && node.path && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={e => { e.stopPropagation(); setCreating(creating ? null : 'file'); setOpen(true); }}
            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
            title="新建文件/文件夹"
          >
            <Plus size={12} />
          </Button>
        )}
      </div>

      {isDir && open && (
        <div className="border-l border-border ml-5">
          {node.children?.map(child => (
            <FileTreeNode key={child.path ?? child.name} node={child} selectedPath={selectedPath} onSelect={onSelect} dirtyMap={dirtyMap} onCreateFile={onCreateFile} onCreateFolder={onCreateFolder} readOnly={readOnly} depth={depth + 1} />
          ))}
          {/* Inline create input */}
          {creating && node.path && (
            <div className="px-2 py-1 flex items-center gap-1" style={{ paddingLeft: `${(depth + 2) * 12}px` }}>
              <div className="flex gap-1 mb-1">
                <Button variant={creating === 'file' ? 'secondary' : 'ghost'} size="xs" className="text-[9px] h-4 px-1" onClick={() => setCreating('file')}>文件</Button>
                <Button variant={creating === 'folder' ? 'secondary' : 'ghost'} size="xs" className="text-[9px] h-4 px-1" onClick={() => setCreating('folder')}>文件夹</Button>
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
                <Button variant={rootCreating === 'file' ? 'secondary' : 'ghost'} size="xs" className="text-[9px] h-4 px-1" onClick={() => setRootCreating('file')}>文件</Button>
                <Button variant={rootCreating === 'folder' ? 'secondary' : 'ghost'} size="xs" className="text-[9px] h-4 px-1" onClick={() => setRootCreating('folder')}>文件夹</Button>
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
            <Button variant="ghost" size="xs" onClick={() => setRootCreating('file')}>
              <Plus size={10} /> 新建
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

// ── 语音输入 Hook ─────────────────────────────────────────────────────────────

function useVoiceInput(onTranscript: (text: string) => void) {
  const recognitionRef = useRef<any>(null);
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

    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as Iterable<any>)
        .map((r: any) => r[0].transcript)
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
    // thinking 模式
    showThinking,
    setShowThinking,
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

  // Load version list + reset all state when skill changes
  useEffect(() => {
    if (!activeSkill) return;
    reloadVersions();
    setViewingVersion(null);
    setSandboxId(null);
    setPipelineStage('draft');
    // Reset test state
    setTestingVersion(null);
    setTestMessages([]);
    setTestInput('');
    setTestDiagram(null);
    setRightTab('chat');
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
  const [testPersonaId, setTestPersonaId] = useState('');
  const [testPersonaList, setTestPersonaList] = useState<Array<{ id: string; label: string; context: Record<string, unknown> }>>([]);

  // Load test personas from API
  useEffect(() => {
    fetch('/api/test-personas?lang=zh')
      .then(r => r.json())
      .then((data: Array<{ id: string; label: string; context: Record<string, unknown> }>) => {
        setTestPersonaList(data);
        if (data.length > 0 && !testPersonaId) setTestPersonaId(data[0].id);
      })
      .catch(console.error);
  }, []);
  const testMsgIdRef = useRef(0);
  const testEndRef = useRef<HTMLDivElement>(null);

  const handleStartTest = useCallback(async (versionNo: number) => {
    setTestingVersion(versionNo);
    setTestMessages([]);
    setTestInput('');
    setDiagramCollapsed(false);
    setRightTab('test');

    // Load mermaid diagram from SKILL.md immediately
    if (activeSkill) {
      try {
        const versionDetail = versions.find(v => v.version_no === versionNo);
        const skillMdPath = versionDetail?.snapshot_path
          ? `skills/${versionDetail.snapshot_path}/SKILL.md`
          : `skills/biz-skills/${activeSkill.id}/SKILL.md`;
        console.log('[TestDiagram] loading from:', skillMdPath);
        const res = await fetch(`/api/files/content?path=${encodeURIComponent(skillMdPath)}`);
        console.log('[TestDiagram] fetch status:', res.status);
        if (res.ok) {
          const data = await res.json();
          const content = data.content ?? '';
          const mermaidMatch = content.match(/```mermaid\r?\n([\s\S]*?)```/);
          console.log('[TestDiagram] mermaid found:', !!mermaidMatch, 'content length:', content.length);
          if (mermaidMatch) {
            setTestDiagram({ skill_name: activeSkill.id, mermaid: mermaidMatch[1].trim() });
          }
        }
      } catch (e) { console.error('[TestDiagram] error:', e); }
    }
  }, [activeSkill, versions]);

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
          persona: testPersonaList.find(p => p.id === testPersonaId)?.context,
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
      <div className="h-full bg-background overflow-y-auto">
        <div className="p-4">
          {/* 头部 */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">技能列表 ({skills.length})</h2>
            <Button size="sm" onClick={createNewSkill}><Plus size={12} /> 新建</Button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">加载中…</span>
            </div>
          )}
          {!loading && loadError && (
            <div className="flex items-center gap-2 text-destructive text-sm py-8">
              <AlertCircle className="w-4 h-4" /> {loadError}
            </div>
          )}
          {!loading && !loadError && (
            <div className="rounded-lg border overflow-hidden">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>描述</TableHead>
                    <TableHead className="w-20">发布版本</TableHead>
                    <TableHead className="w-24">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skills.map(skill => {
                    const reg = registry.find(r => r.id === skill.id);
                    return (
                      <TableRow
                        key={skill.id}
                        className="cursor-pointer"
                        onClick={() => openSkill(skill)}
                      >
                        <TableCell className="font-mono font-medium">{skill.id}</TableCell>
                        <TableCell className="text-muted-foreground truncate max-w-[300px]">{skill.description}</TableCell>
                        <TableCell>
                          {reg?.published_version ? (
                            <Badge variant="secondary">v{reg.published_version}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="xs" onClick={() => openSkill(skill)}>编辑</Button>
                            <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(`确定删除技能 ${skill.id}？`)) {
                                  alert('删除功能开发中');
                                }
                              }}
                            >删除</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {skills.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        暂无技能，点击「新建」开始创建
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 编辑器视图 ──────────────────────────────────────────────────────────────

  const selectedIsMd = selectedFile ? isMdFile(selectedFile.name) : false;

  return (
    <div className="h-full w-full flex bg-background overflow-hidden relative">

      {/* ── 未保存对话框 ── */}
      {showUnsavedDialog && (
        <UnsavedDialog
          onCancel={cancelUnsaved}
          onDiscard={confirmDiscard}
          onSave={saveAndProceed}
        />
      )}

      {/* ── 右侧栏：需求访谈 / 测试（双 Tab） ── */}
      <div className="w-[360px] flex-shrink-0 flex flex-col border-l border-border bg-background shadow-sm" style={{ order: 99 }}>

        {/* Tab 头部 */}
        <div className="h-10 border-b border-border flex items-center shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRightTab('chat')}
            className={`rounded-none h-full border-b-2 transition-colors ${
              rightTab === 'chat' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> 需求访谈
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRightTab('test')}
            className={`rounded-none h-full border-b-2 transition-colors ${
              rightTab === 'test' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" /> 测试{testingVersion !== null ? ` v${testingVersion}` : ''}
          </Button>
          {rightTab === 'chat' && (
            <Label className="ml-auto flex items-center gap-1.5 pr-3 text-[10px] text-muted-foreground cursor-pointer select-none font-normal">
              <Checkbox checked={showThinking} onCheckedChange={(v: boolean) => setShowThinking(v)} className="size-3" />
              思考过程
            </Label>
          )}
        </div>

        {/* ── 需求访谈 Tab ── */}
        {rightTab === 'chat' && (
          <>
            <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-background">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-accent text-primary' : 'bg-accent text-accent-foreground'}`}>
                    {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>
                  <div className="max-w-[85%] flex flex-col gap-1">
                    {msg.role === 'assistant' && msg.thinking && (
                      <div className="text-[10px] italic text-muted-foreground bg-muted border border-border/50 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">
                        {msg.thinking}
                      </div>
                    )}
                    {msg.text && (
                      <div className={`rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-background border border-border text-foreground rounded-tl-none'}`}>
                        <InlineMarkdown text={msg.text} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center shrink-0"><Bot className="w-3.5 h-3.5" /></div>
                  <div className="bg-background border border-border rounded-2xl rounded-tl-none px-3 py-2 flex items-center gap-1 shadow-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0.2s' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            {canPublish && (
              <div className="px-3 pt-2 pb-1 bg-accent/50 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">技能草稿已就绪</span>
                <Button size="sm" onClick={publishSkill} className="text-xs h-7">
                  保存技能
                </Button>
              </div>
            )}
            <div className="p-3 bg-background border-t border-border">
              <form onSubmit={handleSubmit}>
                <div className="rounded-xl border border-border focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 bg-muted transition-all overflow-hidden">
                  <Textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (inputValue.trim() && !isTyping) handleSubmit(e as any); } }}
                    placeholder="描述需求或补充修改…（Enter 发送，Shift+Enter 换行）"
                    rows={3}
                    className="w-full min-h-0 resize-none bg-transparent px-3 pt-2.5 pb-1 border-none shadow-none focus-visible:ring-0 focus-visible:border-transparent text-xs text-foreground placeholder:text-muted-foreground leading-relaxed rounded-none"
                    spellCheck={false}
                  />
                  <div className="flex items-center justify-between px-2 pb-2">
                    <Button type="button" variant="ghost" size="xs" onClick={toggleVoice} className={isRecording ? 'text-destructive animate-pulse' : ''}>
                      {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      {isRecording ? '停止' : '语音'}
                    </Button>
                    <Button type="submit" size="icon-sm" disabled={!inputValue.trim() || isTyping}>
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </>
        )}

        {/* ── 测试 Tab ── */}
        {rightTab === 'test' && (
          <>
            <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-background">
              {testingVersion === null ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  在版本列表中点击 [测试] 开始
                </div>
              ) : testMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  输入消息开始测试 v{testingVersion}
                </div>
              ) : (
                <>
                  {testMessages.map((msg) => (
                    <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-accent text-primary' : 'bg-accent text-accent-foreground'}`}>
                        {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                      </div>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-background border border-border text-foreground rounded-tl-none'}`}>
                        <InlineMarkdown text={msg.text} />
                      </div>
                    </div>
                  ))}
                  {testRunning && (
                    <div className="flex gap-2">
                      <div className="w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center shrink-0"><Bot className="w-3.5 h-3.5" /></div>
                      <div className="bg-background border border-border rounded-2xl rounded-tl-none px-3 py-2 flex items-center gap-1 shadow-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={testEndRef} />
            </div>
            {testingVersion !== null && (
              <div className="p-3 bg-background border-t border-border space-y-2">
                {/* 测试角色 */}
                <div>
                  <Select value={testPersonaId} onValueChange={(v) => v && setTestPersonaId(v)}>
                    <SelectTrigger className="w-full text-[11px] h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {testPersonaList.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Mock/Real */}
                <RadioGroup value={testMode} onValueChange={(v) => v && setTestMode(v as 'mock' | 'real')} className="flex items-center gap-3">
                  <Label className="flex items-center gap-1.5 text-xs text-foreground/70 cursor-pointer font-normal">
                    <RadioGroupItem value="mock" className="size-3" />
                    Mock
                  </Label>
                  <Label className="flex items-center gap-1.5 text-xs text-foreground/70 cursor-pointer font-normal">
                    <RadioGroupItem value="real" className="size-3" />
                    Real
                  </Label>
                </RadioGroup>
                <div className="rounded-xl border border-border focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 bg-muted transition-all overflow-hidden">
                  <Textarea
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendTest(); } }}
                    placeholder="输入测试消息…（Enter 发送）"
                    rows={3}
                    className="w-full min-h-0 resize-none bg-transparent px-3 pt-2.5 pb-1 border-none shadow-none focus-visible:ring-0 focus-visible:border-transparent text-xs text-foreground placeholder:text-muted-foreground leading-relaxed rounded-none"
                    spellCheck={false}
                  />
                  <div className="flex items-center justify-between px-2 pb-2">
                    <Button type="button" variant="ghost" size="xs" onClick={toggleVoice} className={isRecording ? 'text-destructive animate-pulse' : ''}>
                      {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      {isRecording ? '停止' : '语音'}
                    </Button>
                    <Button type="button" size="icon-sm" onClick={handleSendTest} disabled={!testInput.trim() || testRunning}>
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 左列：返回 → 版本 → 文件树 → 测试区 ── */}
      <div className="w-56 flex-shrink-0 bg-background border-r border-border flex flex-col overflow-hidden" style={{ order: 1 }}>

        {/* 返回按钮 + 技能名 */}
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <Button variant="ghost" size="icon-xs" onClick={requestCloseEditor}>
            <ArrowLeft size={14} />
          </Button>
          <span className="text-xs font-semibold text-foreground truncate">{activeSkill?.name ?? ''}</span>
        </div>

        {/* 版本列表 */}
        {versions.length > 0 && (
          <div className="border-b border-border">
            <div className="px-3 py-1.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">版本</span>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  const base = viewingVersion ?? versions.find(v => v.status === 'published')?.version_no ?? versions[0]?.version_no;
                  if (base) handleCreateFrom(base);
                }}
              >
                + 新版本
              </Button>
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
                      isActive ? 'bg-accent border-l-2 border-primary' : 'hover:bg-muted'
                    }`}
                  >
                    <span className={`font-mono flex-shrink-0 ${isActive ? 'text-primary font-semibold' : 'text-foreground/70'}`}>
                      v{v.version_no}
                    </span>
                    {v.status === 'published' && <Badge variant="secondary" className="px-1 py-0.5 text-[9px] flex-shrink-0">已发布</Badge>}
                    {v.status !== 'published' && <Badge variant="outline" className="px-1 py-0.5 text-[9px] flex-shrink-0">已保存</Badge>}

                    {/* 操作按钮：默认隐藏，hover 显示 */}
                    {v.status !== 'published' && (
                      <div className="ml-auto flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="xs" variant="default" className="text-[9px] h-5 px-1.5" onClick={(e) => { e.stopPropagation(); setViewingVersion(v.version_no); handleStartTest(v.version_no); }}>测试</Button>
                        <Button size="xs" className="text-[9px] h-5 px-1.5" onClick={(e) => { e.stopPropagation(); setViewingVersion(v.version_no); handlePublishVersion(v.version_no); }}>发布</Button>
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
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-1.5">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">加载中…</span>
              </div>
            ) : viewingVersion !== null ? (
              /* 版本快照的文件树 */
              versionFileTree.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground gap-1.5">
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
      <div className="flex-1 flex flex-col bg-background overflow-hidden" style={{ order: 2 }}>

        {/* 工具栏 */}
        <div className="h-10 border-b border-border flex items-center justify-between px-3 shrink-0">
          <span className="text-xs text-muted-foreground truncate">
            {selectedFile ? selectedFile.name : ''}
          </span>
          <div className="flex items-center gap-2">
            {/* 保存按钮（发布版本不显示） */}
            {!isPublishedVersion && (
              <Button size="sm" onClick={handleManualSave} disabled={!currentFileDirty || !canSave}>
                保存
              </Button>
            )}
            {selectedIsMd && (
              <ViewToggle viewMode={viewMode} onChange={setViewMode} />
            )}
            {/* 版本状态标签 */}
            {selectedVersion && (
              <span className={`text-[10px] px-2 py-1 rounded-full font-medium bg-secondary text-secondary-foreground`}>
                v{selectedVersion.version_no} {selectedVersion.status === 'published' ? '已发布' : '已保存'}
              </span>
            )}
          </div>
        </div>

        {/* 发布版本只读提示 */}
        {isPublishedVersion && (
          <div className="px-4 py-2 bg-accent border-b border-border text-xs text-accent-foreground">
            当前为发布版本，不可编辑。如需修改请基于此版本创建新版本，或将其他版本设为发布后再编辑。
          </div>
        )}

        {/* 编辑器内容区 */}
        <div className="flex-1 overflow-hidden">

          {fileLoading && (
            <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">加载中…</span>
            </div>
          )}

          {!fileLoading && selectedFile && selectedIsMd && viewMode === 'edit' && (
            <Textarea
              className={`w-full h-full min-h-0 resize-none font-mono text-sm leading-relaxed p-4 border-none shadow-none focus-visible:ring-0 rounded-none ${isPublishedVersion ? 'bg-muted text-muted-foreground' : 'bg-background text-foreground'}`}
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
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm gap-2">
              <AlertCircle size={16} />
              不支持预览此文件类型
            </div>
          )}
        </div>

        {/* ── 测试流程图（测试时展开，非测试时隐藏）── */}
        {rightTab === 'test' && testDiagram && (
          <div className="border-t border-border shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDiagramCollapsed(prev => !prev)}
              className="w-full justify-start rounded-none"
            >
              {diagramCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              <GitBranch size={12} />
              流程图 — {testDiagram.skill_name}
            </Button>
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
