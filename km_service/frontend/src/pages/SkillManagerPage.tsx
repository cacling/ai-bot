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
  ChevronRight, ChevronDown, ChevronUp, Sparkles, CheckCircle2, Plus,
  ArrowLeft, AlertCircle, GitBranch, Search, Wrench,
  Mic, MicOff, Loader2, FlaskConical, ImagePlus, X, ScanEye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { MermaidRenderer } from '../shared/MermaidRenderer';
import { ToolCallPlanPanel } from './components/ToolCallPlanPanel';
import { VisionTaskCard } from './components/VisionTaskCard';
import { PipelinePanel, type PipelineStage } from './components/PipelinePanel';
import { SkillDiagramWorkbench } from './components/SkillDiagramWorkbench';
import { InlineMarkdown, SkillCard, SaveIndicator, ViewToggle, UnsavedDialog } from './components/SkillEditorWidgets';
import { findCustomerGuidanceDiagramSection, replaceCustomerGuidanceMermaid } from '../shared/skillMarkdown';
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

function collectDirFilenames(nodes: SkillFileNode[], dirName: string): string[] {
  for (const node of nodes) {
    if (node.type === 'dir' && node.name === dirName) {
      return (node.children ?? [])
        .filter((child) => child.type === 'file')
        .map((child) => child.name);
    }
    if (node.children?.length) {
      const nested = collectDirFilenames(node.children, dirName);
      if (nested.length > 0) return nested;
    }
  }
  return [];
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

interface SkillManagerProps {
  lang?: 'zh' | 'en';
  onOpenToolContract?: (toolName: string) => void;
}

export function SkillManagerPage({ lang = 'zh', onOpenToolContract }: SkillManagerProps = {}) {
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
    updateEditorContent,
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
    pendingImage,
    setPendingImage,
    pendingImageFile,
    setPendingImageFile,
    visionTask,
    setVisionTask,

    openSkill,
    requestCloseEditor,
    createNewSkill,
    deleteSkill,
    // skill-creator
    phase,
    canPublish,
    publishSkill,
    chatVersionNo, setChatVersionNo,
    // thinking 模式
    showThinking,
    setShowThinking,
  } = useSkillManager(lang);

  const { isRecording, toggle: toggleVoice } = useVoiceInput((text) => setInputValue(text));

  const isNewSkill = !!activeSkill?.id?.startsWith('new-');

  // Tool Call Plan 折叠状态
  const [toolPlanCollapsed, setToolPlanCollapsed] = useState(false);
  const [skillEditorSurface, setSkillEditorSurface] = useState<'document' | 'diagram'>('document');

  // 点击工具跳转 MCP 管理前，先过未保存保护
  const handleOpenToolGuarded = useCallback((toolName: string) => {
    if (!onOpenToolContract) return;
    if (isDirty) {
      if (!confirm('有未保存的修改，是否保存后跳转？')) return;
      handleSave().then(() => onOpenToolContract(toolName));
      return;
    }
    onOpenToolContract(toolName);
  }, [onOpenToolContract, isDirty, handleSave]);

  // ── 图片上传 ────────────────────────────────────────────────────────────────
  const imageInputRef = useRef<HTMLInputElement>(null);
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 20 * 1024 * 1024) {
      alert('图片大小不能超过 20MB');
      return;
    }
    // 用 objectURL 做即时预览（不阻塞，不读 base64）
    setPendingImage(URL.createObjectURL(file));
    setPendingImageFile(file);
    e.target.value = '';
  }, [setPendingImage, setPendingImageFile]);

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

  // 同步 AI 助手操作的版本号
  const effectiveVersionNo = viewingVersion ?? versions.find(v => v.status === 'published')?.version_no ?? null;
  useEffect(() => { setChatVersionNo(effectiveVersionNo); }, [effectiveVersionNo, setChatVersionNo]);

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
  const [testDiagram, setTestDiagram] = useState<{ skill_name: string; mermaid: string; progressState?: string; nodeTypeMap?: Record<string, string> } | null>(null);
  const [diagramCollapsed, setDiagramCollapsed] = useState(false);
  // Backend-sourced diagram data (mermaid + nodeTypeMap from compiled WorkflowSpec)
  const [backendDiagram, setBackendDiagram] = useState<{ mermaid: string; nodeTypeMap: Record<string, string> | null } | null>(null);
  const [backendDiagramLoading, setBackendDiagramLoading] = useState(false);

  // Fetch diagram data from backend when skill changes
  useEffect(() => {
    if (!activeSkill?.id || activeSkill.id.startsWith('new-')) { setBackendDiagram(null); setBackendDiagramLoading(false); return; }
    setBackendDiagram(null);
    setBackendDiagramLoading(true);
    fetch(`/api/skill-versions/${encodeURIComponent(activeSkill.id)}/diagram-data`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.mermaid) setBackendDiagram(data); else setBackendDiagram(null); })
      .catch(() => setBackendDiagram(null))
      .finally(() => setBackendDiagramLoading(false));
  }, [activeSkill?.id]);
  const [testPersonaId, setTestPersonaId] = useState('');
  const [testPersonaList, setTestPersonaList] = useState<Array<{ id: string; label: string; context: Record<string, unknown> }>>([]);

  // Load test personas from API（按 inbound 过滤，技能管理中测试的都是入呼技能）
  useEffect(() => {
    fetch('/api/test-personas?lang=zh&category=inbound')
      .then(r => r.json())
      .then((data: Array<{ id: string; label: string; context: Record<string, unknown> }>) => {
        setTestPersonaList(data);
        if (data.length > 0 && !testPersonaId) {
          setTestPersonaId(data[0].id);
        }
      })
      .catch(console.error);
  }, []);
  const testMsgIdRef = useRef(0);
  const testEndRef = useRef<HTMLDivElement>(null);

  const handleStartTest = useCallback((versionNo: number) => {
    setTestingVersion(versionNo);
    setTestMessages([]);
    setTestInput('');
    setTestDiagram(null);
    setDiagramCollapsed(false);
    setRightTab('test');
    // 流程图不在此处提取，等测试消息返回时由后端 skill_diagram 字段驱动展示
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
          persona: testPersonaList.find(p => p.id === testPersonaId)?.context,
        }),
      });
      const data = await res.json();
      setTestMessages(prev => [...prev, { id: ++testMsgIdRef.current, role: 'assistant', text: data.text ?? data.error ?? '无返回' }]);
      if (data.skill_diagram) {
        setTestDiagram(data.skill_diagram);
      }
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
    if (!content) return { channels: ['online'], version: '1.0.0' };
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
    if (!sandboxId) return;
    if (!confirm('确定丢弃沙箱？所有测试数据将被清除，此操作不可恢复。')) return;
    try { await fetch(`/api/sandbox/${sandboxId}`, { method: 'DELETE' }); } catch {}
    setSandboxId(null);
    setPipelineStage('draft');
  }, [sandboxId]);

  const handleRollbackDone = useCallback(() => {
    if (selectedFile) handleSelectFile(selectedFile);
    reloadVersions();
  }, [selectedFile, handleSelectFile, reloadVersions]);


  // ── 列表视图 ────────────────────────────────────────────────────────────────
  interface SkillRegEntry { id: string; published_version: number | null; latest_version: number; channels: string | null; mode: string | null; tool_names: string | null; tags: string | null; updated_at: string | null }
  const [registry, setRegistry] = useState<SkillRegEntry[]>([]);
  const [listSearch, setListSearch] = useState('');
  const [listModeFilter, setListModeFilter] = useState<string>('all');
  type QuickFilter = 'all' | 'published' | 'draft' | 'inbound' | 'outbound';
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  useEffect(() => {
    if (view !== 'list') return;
    fetch('/api/skill-versions/registry').then(r => r.json()).then(d => setRegistry(d.items ?? [])).catch(() => {});
  }, [view]);

  // 中间区模式（编辑器视图用，但 hook 必须在 early return 前声明）
  type CenterMode = 'edit' | 'preview' | 'error';
  const [centerMode, setCenterMode] = useState<CenterMode>('edit');
  const [fileLoadError, setFileLoadError] = useState<string | null>(null);

  // Helper: parse JSON arrays stored as strings
  const parseJsonArr = (s: string | null): string[] => {
    if (!s) return [];
    try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; }
  };

  // Stats
  const listStats = useMemo(() => {
    const published = registry.filter(r => r.published_version != null).length;
    const hasDraft = registry.filter(r => r.latest_version > (r.published_version ?? 0)).length;
    const inbound = registry.filter(r => r.mode === 'inbound').length;
    const outbound = registry.filter(r => r.mode === 'outbound').length;
    return { total: skills.length, published, hasDraft, inbound, outbound };
  }, [skills, registry]);

  // Filtered list
  const filteredSkills = useMemo(() => {
    let list = skills;
    if (listSearch.trim()) {
      const q = listSearch.toLowerCase();
      list = list.filter(s => {
        const reg = registry.find(r => r.id === s.id);
        const tags = parseJsonArr(reg?.tags ?? null);
        return s.id.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || tags.some(t => t.includes(q));
      });
    }
    if (quickFilter === 'published') list = list.filter(s => { const r = registry.find(x => x.id === s.id); return r?.published_version != null; });
    else if (quickFilter === 'draft') list = list.filter(s => { const r = registry.find(x => x.id === s.id); return r && r.latest_version > (r.published_version ?? 0); });
    else if (quickFilter === 'inbound') list = list.filter(s => { const r = registry.find(x => x.id === s.id); return r?.mode === 'inbound'; });
    else if (quickFilter === 'outbound') list = list.filter(s => { const r = registry.find(x => x.id === s.id); return r?.mode === 'outbound'; });
    if (listModeFilter !== 'all') list = list.filter(s => { const r = registry.find(x => x.id === s.id); return r?.mode === listModeFilter; });
    return list;
  }, [skills, registry, listSearch, quickFilter, listModeFilter]);

  const selectedIsSkillMd = selectedFile?.name === 'SKILL.md';
  const currentTreeNodes = viewingVersion !== null ? versionFileTree : fileTree;
  const referenceFiles = useMemo(() => collectDirFilenames(currentTreeNodes, 'references'), [currentTreeNodes]);
  const assetFiles = useMemo(() => collectDirFilenames(currentTreeNodes, 'assets'), [currentTreeNodes]);

  useEffect(() => {
    if (!selectedIsSkillMd && skillEditorSurface !== 'document') {
      setSkillEditorSurface('document');
    }
  }, [selectedIsSkillMd, skillEditorSurface]);

  const handleDiagramMermaidChange = useCallback((mermaid: string) => {
    updateEditorContent((current) => replaceCustomerGuidanceMermaid(current, mermaid));
    if (selectedFile?.path) {
      setFileDirtyMap(prev => new Map(prev).set(selectedFile.path!, true));
    }
  }, [selectedFile, updateEditorContent]);

  if (view === 'list') {
    return (
      <div className="h-full bg-background overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">技能管理</h2>
            <Button size="sm" onClick={createNewSkill}><Plus size={12} /> 新建</Button>
          </div>

          {/* Stats cards */}
          {!loading && skills.length > 0 && (
            <div className="grid grid-cols-5 gap-2">
              {([
                { key: 'all' as QuickFilter, label: '全部', value: listStats.total, color: 'text-foreground' },
                { key: 'published' as QuickFilter, label: '已发布', value: listStats.published, color: 'text-emerald-600' },
                { key: 'draft' as QuickFilter, label: '有草稿', value: listStats.hasDraft, color: 'text-amber-600' },
                { key: 'inbound' as QuickFilter, label: '呼入', value: listStats.inbound, color: 'text-primary' },
                { key: 'outbound' as QuickFilter, label: '外呼', value: listStats.outbound, color: 'text-primary' },
              ]).map(card => (
                <button key={card.key} onClick={() => setQuickFilter(quickFilter === card.key ? 'all' : card.key)}
                  className={`rounded-lg border p-3 text-left transition-colors ${quickFilter === card.key ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}>
                  <div className={`text-lg font-bold ${card.color}`}>{card.value}</div>
                  <div className="text-[11px] text-muted-foreground">{card.label}</div>
                </button>
              ))}
            </div>
          )}

          {/* Search + filters */}
          {!loading && skills.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={listSearch} onChange={e => setListSearch(e.target.value)} placeholder="搜索技能名 / 描述 / 标签" className="pl-8 text-xs h-8" />
              </div>
              <Select value={listModeFilter} onValueChange={v => setListModeFilter(v ?? 'all')}>
                <SelectTrigger className="w-28 text-xs h-8"><SelectValue placeholder="模式" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部模式</SelectItem>
                  <SelectItem value="inbound">呼入</SelectItem>
                  <SelectItem value="outbound">外呼</SelectItem>
                </SelectContent>
              </Select>
              {(listSearch || quickFilter !== 'all' || listModeFilter !== 'all') && (
                <Button variant="ghost" size="xs" onClick={() => { setListSearch(''); setQuickFilter('all'); setListModeFilter('all'); }}>清除筛选</Button>
              )}
            </div>
          )}

          {/* Loading / Error */}
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

          {/* Table */}
          {!loading && !loadError && (
            <div className="rounded-lg border overflow-hidden">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">名称</TableHead>
                    <TableHead className="w-16 text-center">模式</TableHead>
                    <TableHead className="w-24 text-center">渠道</TableHead>
                    <TableHead className="w-16 text-center">工具</TableHead>
                    <TableHead className="w-24 text-center">版本</TableHead>
                    <TableHead>标签</TableHead>
                    <TableHead className="w-24 text-center">更新</TableHead>
                    <TableHead className="w-20 text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSkills.map(skill => {
                    const reg = registry.find(r => r.id === skill.id);
                    const channels = parseJsonArr(reg?.channels ?? null);
                    const toolNames = parseJsonArr(reg?.tool_names ?? null);
                    const tags = parseJsonArr(reg?.tags ?? null);
                    const hasDraft = reg && reg.latest_version > (reg.published_version ?? 0);
                    return (
                      <TableRow key={skill.id} className="cursor-pointer" onClick={() => openSkill(skill)}>
                        <TableCell>
                          <div className="font-mono font-semibold">{skill.id}</div>
                          {skill.description && <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{skill.description}</div>}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={reg?.mode === 'outbound' ? 'secondary' : 'outline'} className="text-[10px]">
                            {reg?.mode === 'outbound' ? '外呼' : '呼入'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-0.5 flex-wrap">
                            {channels.slice(0, 2).map(ch => (
                              <Badge key={ch} variant="secondary" className="text-[9px]">{ch}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-[11px]" title={toolNames.join(', ')}>{toolNames.length}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {reg?.published_version ? (
                              <Badge variant="default" className="text-[9px]">v{reg.published_version}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">未发布</span>
                            )}
                            {hasDraft && <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-300">草稿</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-0.5 flex-wrap">
                            {tags.slice(0, 3).map(t => (
                              <span key={t} className="text-[9px] px-1.5 py-0.5 bg-muted rounded">{t}</span>
                            ))}
                            {tags.length > 3 && <span className="text-[9px] text-muted-foreground">+{tags.length - 3}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-[10px] text-muted-foreground">
                          {reg?.updated_at ? new Date(reg.updated_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '—'}
                        </TableCell>
                        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive"
                            onClick={async () => {
                              if (!confirm(`确定删除技能「${skill.id}」？此操作不可恢复。`)) return;
                              try { await deleteSkill(skill.id); } catch (err: any) { alert(`删除失败: ${err.message ?? '未知错误'}`); }
                            }}
                          >删除</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredSkills.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {skills.length === 0 ? '暂无技能，点击「新建」开始创建' : '无匹配技能'}
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

  // centerMode / fileLoadError 已在 early return 前声明

  // 已发布版本信息
  const publishedVersion = versions.find(v => v.status === 'published');

  // 发布准备度
  const readiness = {
    saved: !currentFileDirty,
    hasChanges: viewingVersion !== null && publishedVersion && viewingVersion !== publishedVersion.version_no,
    tested: false, // 简化：后续可接入真实测试状态
  };

  return (
    <div className="h-full w-full bg-background overflow-hidden relative flex flex-col">

      {/* ── 未保存对话框 ── */}
      {showUnsavedDialog && (
        <UnsavedDialog
          onCancel={cancelUnsaved}
          onDiscard={confirmDiscard}
          onSave={saveAndProceed}
        />
      )}

      {/* ══ 顶部状态栏（全页宽度）══════════════════════════════════════════ */}
      <div className="bg-background border-b border-border px-4 py-2.5 shrink-0">
        {/* 第一行：返回 + 技能名 + 动作按钮 */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon-xs" onClick={requestCloseEditor}>
              <ArrowLeft size={14} />
            </Button>
            <div className="min-w-0">
              <span className="text-sm font-semibold font-mono">{activeSkill?.id ?? ''}</span>
              {activeSkill?.description && (
                <span className="text-xs text-muted-foreground ml-2">{activeSkill.description}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isPublishedVersion && (
              <Button variant="outline" size="sm" onClick={handleManualSave} disabled={!currentFileDirty || !canSave}>
                保存草稿
              </Button>
            )}
            {!isPublishedVersion && selectedVersion && (
              <Button size="sm" onClick={() => handlePublishVersion(selectedVersion.version_no)}>
                发布版本
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ══ 三栏主体 ════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-hidden">
      <ResizablePanelGroup orientation="horizontal" className="h-full" id="skill-editor">

      {/* ── 左侧：版本区 + 文件区 ── */}
      <ResizablePanel id="left" defaultSize="15%" minSize="10%" maxSize="25%">
      <div className="h-full bg-background border-r border-border flex flex-col overflow-hidden">

        {/* 版本区 */}
        <div className="border-b border-border shrink-0">
          <div className="px-3 py-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">版本</span>
            <Button
              variant="ghost"
              size="icon-xs"
              title="新版本"
              onClick={() => {
                const base = viewingVersion ?? publishedVersion?.version_no ?? versions[0]?.version_no;
                if (base) handleCreateFrom(base);
              }}
            >
              <Plus size={12} />
            </Button>
          </div>
          <div className="pb-1 max-h-32 overflow-y-auto">
            {versions.map(v => {
              const isActive = viewingVersion === null
                ? v.status === 'published'
                : viewingVersion === v.version_no;
              return (
                <div
                  key={v.id}
                  onClick={() => {
                    setViewingVersion(v.version_no);
                    setCenterMode('edit');
                    if (rightTab === 'test') handleStartTest(v.version_no);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 text-[11px] cursor-pointer transition ${
                    isActive ? 'bg-accent border-l-2 border-primary' : 'hover:bg-muted'
                  }`}
                >
                  <span className={`font-mono flex-shrink-0 ${isActive ? 'text-primary font-semibold' : 'text-foreground/70'}`}>
                    v{v.version_no}
                  </span>
                  {v.status === 'published'
                    ? <Badge variant="secondary" className="px-1 py-0.5 text-[9px]">已发布</Badge>
                    : <Badge variant="outline" className="px-1 py-0.5 text-[9px]">草稿</Badge>
                  }
                </div>
              );
            })}
          </div>
          {/* 当前版本摘要 */}
          {selectedVersion && (
            <div className="px-3 py-1 border-t border-border text-[9px] text-muted-foreground truncate">
              <span className="font-mono font-medium text-foreground">v{selectedVersion.version_no}</span>
              <span className="ml-1">{selectedVersion.status === 'published' ? '已发布' : '草稿'}</span>
              {publishedVersion && selectedVersion.version_no !== publishedVersion.version_no && (
                <span className="ml-1">· 基于 v{publishedVersion.version_no}</span>
              )}
            </div>
          )}
        </div>

        {/* 文件区 + Tool Call Plan（上下可拖拽分隔） */}
        <ResizablePanelGroup orientation="vertical" className="flex-1" id="left-split">
          {/* 上半区：文件树 */}
          <ResizablePanel id="file-tree" defaultSize="70%" minSize="30%">
            <div className="h-full overflow-y-auto">
              <div className="px-3 py-1">
                <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                  文件{selectedVersion ? ` (v${selectedVersion.version_no})` : ''}
                </span>
              </div>
              {fileTreeLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">加载中…</span>
                </div>
              ) : viewingVersion !== null ? (
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
                    onSelect={(n) => { handleSelectFile(n); setCenterMode('edit'); }}
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
                  onSelect={(n) => { handleSelectFile(n); setCenterMode('edit'); }}
                  readOnly
                />
              )}
            </div>
          </ResizablePanel>

          {/* 下半区：发布准备度 + Tool Call Plan */}
          {activeSkill && !isNewSkill && (
            <>
              <ResizableHandle />
              <ResizablePanel id="tool-plan" defaultSize="30%" minSize="10%" maxSize="60%">
                <div className="h-full flex flex-col border-t border-border bg-background overflow-hidden">
                  {/* 发布准备度（圆点式） */}
                  <div className="px-3 py-1 border-b border-border shrink-0 flex items-center gap-2 text-[9px] text-muted-foreground">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${readiness.saved ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className="truncate" title={readiness.saved ? '已保存' : '未保存'}>保存</span>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${readiness.hasChanges ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                    <span className="truncate" title={readiness.hasChanges ? '有变更' : '无变更'}>变更</span>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${readiness.tested ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                    <span className="truncate" title={readiness.tested ? '已测试' : '未测试'}>测试</span>
                  </div>
                  {/* Tool Call Plan 折叠头 */}
                  <button
                    onClick={() => setToolPlanCollapsed(prev => !prev)}
                    className="flex items-center gap-1 px-3 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted transition-colors shrink-0 w-full text-left"
                  >
                    {toolPlanCollapsed ? <ChevronRight size={9} /> : <ChevronDown size={9} />}
                    <Wrench size={9} />
                    Tool Call Plan
                  </button>
                  {/* Tool Call Plan 内容区 */}
                  {!toolPlanCollapsed && (
                    <div className="flex-1 overflow-y-auto px-1.5 pb-1">
                      <ToolCallPlanPanel skillId={activeSkill.id} onOpenTool={handleOpenToolGuarded} />
                    </div>
                  )}
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>

      </div>
      </ResizablePanel>

      <ResizableHandle />

      {/* ── 中间：主工作区（多模式）── */}
      <ResizablePanel id="center" defaultSize="60%" minSize="30%">
      <div className="h-full flex flex-col bg-background overflow-hidden">

        {/* 中间区工具栏 */}
        <div className="h-9 border-b border-border flex items-center justify-between px-3 shrink-0">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground truncate mr-2">
              {selectedFile ? selectedFile.name : ''}
            </span>
            {centerMode === 'edit' && selectedIsSkillMd && (
              <div className="flex items-center rounded-md border border-border p-0.5 mr-2">
                <Button
                  variant={skillEditorSurface === 'document' ? 'secondary' : 'ghost'}
                  size="xs"
                  className="text-[10px] h-6"
                  onClick={() => setSkillEditorSurface('document')}
                >
                  文档
                </Button>
                <Button
                  variant={skillEditorSurface === 'diagram' ? 'secondary' : 'ghost'}
                  size="xs"
                  className="text-[10px] h-6"
                  onClick={() => setSkillEditorSurface('diagram')}
                >
                  状态图工作台
                </Button>
              </div>
            )}
            {centerMode === 'edit' && selectedIsMd && (
              <>
                {skillEditorSurface === 'document' && (
                  <>
                    <Button variant={viewMode === 'edit' ? 'secondary' : 'ghost'} size="xs" className="text-[10px] h-6" onClick={() => setViewMode('edit')}>编辑</Button>
                    <Button variant={viewMode === 'preview' ? 'secondary' : 'ghost'} size="xs" className="text-[10px] h-6" onClick={() => setViewMode('preview')}>只读</Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* 已发布版本只读提示 */}
        {isPublishedVersion && centerMode === 'edit' && (
          <div className="px-4 py-2 bg-accent border-b border-border text-xs text-accent-foreground flex items-center justify-between">
            <span>当前为发布版本，不可编辑。</span>
            <Button size="xs" variant="outline" onClick={() => {
              const base = publishedVersion?.version_no;
              if (base) handleCreateFrom(base);
            }}>
              基于此版本创建新版本
            </Button>
          </div>
        )}

        {/* ── 编辑区 + 流程图（可拖动分隔） ── */}
        {centerMode === 'edit' && (() => {
          if (selectedIsSkillMd && skillEditorSurface === 'diagram') {
            return (
              <SkillDiagramWorkbench
                skillMd={editorContent}
                skillId={activeSkill?.id ?? null}
                versionNo={viewingVersion}
                readOnly={isPublishedVersion}
                references={referenceFiles}
                assets={assetFiles}
                onChangeMermaid={handleDiagramMermaidChange}
              />
            );
          }

          // Diagram data computed from backend API (same source as agent workstation)
          const fallbackMermaid = backendDiagramLoading
            ? null
            : (findCustomerGuidanceDiagramSection(editorContent).mermaid?.replace(/\s*%%[^\n]*/gm, '').trim() ?? null);
          const activeMermaid = testDiagram?.mermaid ?? backendDiagram?.mermaid ?? fallbackMermaid;
          const activeNodeTypeMap = (testDiagram as any)?.nodeTypeMap ?? backendDiagram?.nodeTypeMap ?? undefined;
          const diagramLabel = testDiagram ? testDiagram.skill_name : (selectedIsSkillMd ? activeSkill?.id : null);
          const isTestMode = testingVersion !== null;
          const showDiagram = !!activeMermaid || isTestMode;

          return (
            <ResizablePanelGroup orientation="vertical" className="flex-1">
              <ResizablePanel defaultSize={showDiagram ? 60 : 100} minSize={20}>
                <div className="h-full overflow-hidden">
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
                        extensions={getCodeMirrorLang(selectedFile.name) ? [getCodeMirrorLang(selectedFile.name)!] : []}
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
                  {!fileLoading && !selectedFile && (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      选择左侧文件开始编辑
                    </div>
                  )}
                </div>
              </ResizablePanel>

              {showDiagram && (
                <>
                  <ResizableHandle />
                  <ResizablePanel defaultSize={40} minSize={15}>
                    <div className="h-full flex flex-col overflow-hidden">
                      <Button variant="ghost" size="sm" onClick={() => setDiagramCollapsed(prev => !prev)} className="w-full justify-start rounded-none text-xs shrink-0 border-b border-border">
                        {diagramCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        <GitBranch size={12} /> 流程图{diagramLabel ? ` — ${diagramLabel}` : ''}
                        {testDiagram && <Badge variant="outline" className="ml-2 text-[9px] px-1 py-0">测试中</Badge>}
                      </Button>
                      {!diagramCollapsed && (
                        <div className="flex-1 px-3 pb-2 overflow-auto">
                          {activeMermaid ? (
                            <MermaidRenderer mermaid={activeMermaid} nodeTypeMap={activeNodeTypeMap} progressState={testDiagram?.progressState} height="100%" zoom={true} autoFocus={!!testDiagram} emptyText="暂无流程图" />
                          ) : (
                            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                              {isTestMode ? '发送测试消息后展示流程图' : '当前文件无 mermaid 状态图'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          );
        })()}

      </div>
      </ResizablePanel>

      <ResizableHandle />

      {/* ── 右侧：双 Tab（AI 助手 + 测试） ── */}
      <ResizablePanel id="right" defaultSize="25%" minSize="15%" maxSize="40%">
      <div className="h-full flex flex-col border-l border-border bg-background overflow-hidden">

        {/* Tab 切换 */}
        <div className="h-9 border-b border-border flex items-center px-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRightTab('chat')}
            className={`flex items-center gap-1 px-3 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
              rightTab === 'chat' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            AI 助手{selectedVersion && !isNewSkill ? ` v${selectedVersion.version_no}` : ''}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (selectedVersion && (testingVersion !== selectedVersion.version_no)) {
                handleStartTest(selectedVersion.version_no);
              } else {
                setRightTab('test');
              }
            }}
            className={`flex items-center gap-1 px-3 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
              rightTab === 'test' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <FlaskConical className="w-3 h-3" />
            测试{testingVersion !== null ? ` v${testingVersion}` : selectedVersion ? ` v${selectedVersion.version_no}` : ''}
          </Button>
          {rightTab === 'chat' && (
            <Label className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none font-normal pr-2">
              <Checkbox checked={showThinking} onCheckedChange={(v: boolean) => setShowThinking(v)} className="size-3" />
              思考
            </Label>
          )}
        </div>

        {/* ── AI 助手 Tab ── */}
        {rightTab === 'chat' && (
          <>
            {/* AI 对话区 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-background">
              {messages.map((msg) => (
                msg.role === 'system' ? (
                  <div key={msg.id} className="flex gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                      <ScanEye className="w-3.5 h-3.5" />
                    </div>
                    <div className="max-w-[90%] rounded-2xl rounded-tl-none px-3 py-2 text-xs leading-relaxed shadow-sm bg-amber-50 border border-amber-200 text-foreground dark:bg-amber-950/20 dark:border-amber-800">
                      <div className="text-[10px] font-medium text-amber-600 dark:text-amber-400 mb-1">流程图解析结果</div>
                      <InlineMarkdown text={msg.text} />
                    </div>
                  </div>
                ) : (
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
                      {msg.image && (
                        <div className={`rounded-2xl overflow-hidden shadow-sm ${msg.role === 'user' ? 'rounded-tr-none' : 'rounded-tl-none'}`}>
                          <img src={msg.image} alt="上传的流程图" className="max-w-full max-h-48 object-contain rounded-2xl border border-border" />
                        </div>
                      )}
                      {msg.text && (
                        <div className={`rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-background border border-border text-foreground rounded-tl-none'}`}>
                          <InlineMarkdown text={msg.text} />
                        </div>
                      )}
                    </div>
                  </div>
                )
              ))}
              {isTyping && visionTask && visionTask.status !== 'completed' ? (
                <VisionTaskCard
                  task={visionTask}
                  onCollapse={() => setVisionTask(prev => prev ? { ...prev, collapsed: !prev.collapsed } : null)}
                  onCancel={() => setVisionTask(null)}
                />
              ) : isTyping ? (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center shrink-0"><Bot className="w-3.5 h-3.5" /></div>
                  <div className="bg-background border border-border rounded-2xl rounded-tl-none px-3 py-2 flex items-center gap-1 shadow-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0.2s' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>
            {canPublish && (
              <div className="px-3 pt-2 pb-1 bg-accent/50 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">技能草稿已就绪</span>
                <Button size="sm" onClick={publishSkill} className="text-xs h-7">保存技能</Button>
              </div>
            )}

            {/* AI 输入区 */}
            <div className="p-3 bg-background border-t border-border shrink-0">
              <form onSubmit={handleSubmit}>
                <div className="rounded-xl border border-border focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 bg-muted transition-all overflow-hidden">
                  {pendingImage && (
                    <div className="px-3 pt-2">
                      <div className="flex items-start gap-2">
                        <div className="relative group">
                          <img src={pendingImage} alt="待发送的流程图" className="max-h-24 rounded-lg border border-border object-contain" />
                          <button type="button" onClick={() => { setPendingImage(null); setPendingImageFile(null); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                      {pendingImageFile && pendingImageFile.size > 2 * 1024 * 1024 && (
                        <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] text-amber-700 leading-relaxed dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                          已检测到大尺寸图片（{(pendingImageFile.size / 1024 / 1024).toFixed(1)}MB），解析预计需要 5-10 分钟。系统会自动裁边、分片、合并。你可以继续编辑技能内容。
                        </div>
                      )}
                    </div>
                  )}
                  <Textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if ((inputValue.trim() || pendingImage) && !isTyping) handleSubmit(e as any); } }}
                    placeholder="描述需求或让 AI 帮你修改…"
                    rows={2}
                    className="w-full min-h-0 resize-none bg-transparent px-3 pt-2.5 pb-1 border-none shadow-none focus-visible:ring-0 focus-visible:border-transparent text-xs text-foreground placeholder:text-muted-foreground leading-relaxed rounded-none"
                    spellCheck={false}
                  />
                  <div className="flex items-center justify-between px-2 pb-2">
                    <div className="flex items-center gap-1">
                      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                      <Button type="button" variant="ghost" size="xs" onClick={() => imageInputRef.current?.click()} title="上传流程图">
                        <ImagePlus className="w-3.5 h-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="xs" onClick={toggleVoice} className={isRecording ? 'text-destructive animate-pulse' : ''}>
                        {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                    <Button type="submit" size="icon-sm" disabled={(!inputValue.trim() && !pendingImage) || isTyping}>
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
            {/* 测试对话区 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-background">
              {testingVersion === null ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  点击顶部「运行测试」开始
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
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-muted border border-border text-foreground rounded-tl-none'}`}>
                        <InlineMarkdown text={msg.text} />
                      </div>
                    </div>
                  ))}
                  {testRunning && (
                    <div className="flex gap-2">
                      <div className="w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center shrink-0"><Bot className="w-3.5 h-3.5" /></div>
                      <div className="bg-muted border border-border rounded-2xl rounded-tl-none px-3 py-2 flex items-center gap-1 shadow-sm">
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

            {/* 测试输入区 */}
            {testingVersion !== null && (
              <div className="p-3 bg-background border-t border-border space-y-2 shrink-0">
                <Select value={testPersonaId} onValueChange={(v) => { if (v) setTestPersonaId(v); }}>
                  <SelectTrigger className="w-full text-[11px] h-7">
                    <SelectValue placeholder="选择测试用户">
                      {testPersonaList.find(p => p.id === testPersonaId)?.label ?? testPersonaId}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {testPersonaList.map(p => {
                      const ctx = p.context as Record<string, string>;
                      return <SelectItem key={p.id} value={p.id}>{ctx.name ?? p.id} · {ctx.phone ?? ''}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Textarea
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendTest(); } }}
                    placeholder="输入测试消息…（Enter 发送）"
                    rows={2}
                    className="flex-1 min-h-0 resize-none text-xs rounded-lg"
                    spellCheck={false}
                  />
                  <Button size="sm" onClick={handleSendTest} disabled={!testInput.trim() || testRunning} className="self-end">
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

      </div>
      </ResizablePanel>

      </ResizablePanelGroup>
      </div>
    </div>
  );
}
