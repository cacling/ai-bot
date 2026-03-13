/**
 * useSkillManager.ts — 技能管理页面的全部逻辑
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ── 类型 ──────────────────────────────────────────────────────────────────────

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}

export interface SkillFileNode {
  name: string;
  type: 'file' | 'dir';
  /** 相对于 backend/PROJECT_ROOT 的路径；null = 内存节点（新建技能）*/
  path: string | null;
  content?: string; // 仅内存节点
  children?: SkillFileNode[];
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}

export interface Skill extends SkillMeta {
  messages: ChatMessage[];
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
/** edit = 纯 textarea；preview = 只读渲染 */
export type ViewMode = 'edit' | 'preview';
export type SkillManagerView = 'list' | 'editor';

// ── 内存模板（新建技能）──────────────────────────────────────────────────────

const NEW_SKILL_WELCOME_MSG: ChatMessage = {
  id: 1,
  role: 'assistant',
  text: '你好！我是**需求澄清器**。请告诉我你想要创建一个什么技能（Skill）？\n你可以简单描述一下目标，我会帮你梳理成结构化的 `SKILL.md`，并生成相应的参考文档和脚本文件。',
};

function makeExistingSkillMsg(meta: SkillMeta): ChatMessage {
  return {
    id: 1,
    role: 'assistant',
    text: `我已分析了「**${meta.name}**」的技能定义。\n\n**当前描述**：${meta.description || '（暂无描述）'}\n\n请问有什么需要修改或优化的？`,
  };
}

const NEW_SKILL_TREE: SkillFileNode[] = [
  {
    name: 'SKILL.md',
    type: 'file',
    path: null,
    content:
      '# 技能名称：[待定义]\n\n## 1. 目标\n[待补充]\n\n## 2. 上下文\n[待补充]\n\n## 3. 步骤流程\n[待补充]',
  },
  { name: 'references', type: 'dir', path: null, children: [] },
  { name: 'scripts', type: 'dir', path: null, children: [] },
];

// ── 工具函数 ──────────────────────────────────────────────────────────────────

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function isMdFile(name: string): boolean {
  return name.toLowerCase().endsWith('.md');
}

export function isTextFile(name: string): boolean {
  return /\.(md|ts|tsx|js|jsx|py|sh|bash|json|yaml|yml|txt|toml|env)$/i.test(name);
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchSkillList(): Promise<SkillMeta[]> {
  const res = await fetch('/api/skills');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { skills: SkillMeta[] }).skills;
}

async function fetchSkillFiles(id: string): Promise<SkillFileNode[]> {
  const res = await fetch(`/api/skills/${encodeURIComponent(id)}/files`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { tree: SkillFileNode[] }).tree;
}

async function fetchFileContent(path: string): Promise<string> {
  const res = await fetch(`/api/files/content?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { content: string }).content;
}

async function saveFileContent(path: string, content: string): Promise<void> {
  const res = await fetch('/api/files/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ── 自定义 Hook ───────────────────────────────────────────────────────────────

export function useSkillManager() {
  // 列表层
  const [view, setView] = useState<SkillManagerView>('list');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);

  // 对话
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 文件树
  const [fileTree, setFileTree] = useState<SkillFileNode[]>([]);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);

  // 当前文件 & 编辑器
  const [selectedFile, setSelectedFile] = useState<SkillFileNode | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [viewMode, setViewMode] = useState<ViewMode>('edit');

  // Dirty 追踪（用 ref 避免闭包问题）
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  const lastSavedContentRef = useRef('');

  function setDirty(v: boolean) {
    isDirtyRef.current = v;
    setIsDirty(v);
  }

  // 未保存离开对话框
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  // ── 初始加载 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetchSkillList()
      .then((metas) =>
        setSkills(metas.map((m) => ({ ...m, messages: [makeExistingSkillMsg(m)] })))
      )
      .catch((err) => setLoadError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  // ── 自动滚动对话 ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── 加载文件树（activeSkillId 变化时触发）────────────────────────────────────
  useEffect(() => {
    if (!activeSkillId) return;

    setFileTree([]);
    setSelectedFile(null);
    setEditorContent('');
    setDirty(false);
    lastSavedContentRef.current = '';

    if (activeSkillId.startsWith('new-')) {
      setFileTree(NEW_SKILL_TREE);
      const skillMd = NEW_SKILL_TREE.find((n) => n.name === 'SKILL.md')!;
      doLoadFile(skillMd);
      return;
    }

    setFileTreeLoading(true);
    fetchSkillFiles(activeSkillId)
      .then((nodes) => {
        setFileTree(nodes);
        const skillMd = nodes.find((n) => n.name === 'SKILL.md' && n.type === 'file');
        if (skillMd) doLoadFile(skillMd);
      })
      .catch(() => setFileTree([]))
      .finally(() => setFileTreeLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSkillId]);

  // ── 实际加载文件内容（不检查 dirty，供内部直接调用）────────────────────────
  function doLoadFile(node: SkillFileNode) {
    if (node.type !== 'file') return;
    setSelectedFile(node);
    setSaveStatus('idle');
    setDirty(false);

    if (node.path === null) {
      const content = node.content ?? '';
      setEditorContent(content);
      lastSavedContentRef.current = content;
      return;
    }

    if (!isTextFile(node.name)) {
      setEditorContent('（二进制或不支持的文件类型）');
      lastSavedContentRef.current = '';
      return;
    }

    setFileLoading(true);
    fetchFileContent(node.path)
      .then((content) => {
        setEditorContent(content);
        lastSavedContentRef.current = content;
        setDirty(false);
      })
      .catch((err) => setEditorContent(`// 加载失败: ${String(err)}`))
      .finally(() => setFileLoading(false));
  }

  // ── dirty guard：若有未保存修改则弹框，否则直接执行 ─────────────────────────
  function guardDirty(action: () => void) {
    if (isDirtyRef.current) {
      pendingActionRef.current = action;
      setShowUnsavedDialog(true);
    } else {
      action();
    }
  }

  // ── 选中文件（文件树点击，带 dirty guard）──────────────────────────────────
  const handleSelectFile = useCallback((node: SkillFileNode) => {
    if (node.type !== 'file') return;
    guardDirty(() => doLoadFile(node));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 内容变更（由 textarea onChange 调用）────────────────────────────────────
  const handleEditorChange = useCallback((content: string) => {
    setEditorContent(content);
    setDirty(true);
  }, []);

  // ── 保存 ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedFile || selectedFile.path === null || !isTextFile(selectedFile.name)) return;
    setSaveStatus('saving');
    try {
      await saveFileContent(selectedFile.path, editorContent);
      lastSavedContentRef.current = editorContent;
      setDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, [selectedFile, editorContent]);

  // ── 未保存对话框：保存后继续 ─────────────────────────────────────────────────
  const saveAndProceed = useCallback(async () => {
    if (selectedFile?.path && isTextFile(selectedFile.name)) {
      setSaveStatus('saving');
      try {
        await saveFileContent(selectedFile.path, editorContent);
        lastSavedContentRef.current = editorContent;
        setDirty(false);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
        return; // 保存失败时不继续
      }
    }
    setShowUnsavedDialog(false);
    pendingActionRef.current?.();
    pendingActionRef.current = null;
  }, [selectedFile, editorContent]);

  // ── 未保存对话框：直接离开 ─────────────────────────────────────────────────
  const confirmDiscard = useCallback(() => {
    setDirty(false);
    setShowUnsavedDialog(false);
    pendingActionRef.current?.();
    pendingActionRef.current = null;
  }, []);

  // ── 未保存对话框：取消 ─────────────────────────────────────────────────────
  const cancelUnsaved = useCallback(() => {
    setShowUnsavedDialog(false);
    pendingActionRef.current = null;
  }, []);

  // ── 打开技能编辑器 ──────────────────────────────────────────────────────────
  const openSkill = useCallback((skill: Skill) => {
    setActiveSkillId(skill.id);
    setMessages(skill.messages);
    setSaveStatus('idle');
    setViewMode('edit');
    setView('editor');
  }, []);

  // ── 关闭编辑器（带 dirty guard）────────────────────────────────────────────
  const requestCloseEditor = useCallback(() => {
    guardDirty(() => {
      setSkills((prev) =>
        prev.map((s) => (s.id === activeSkillId ? { ...s, messages } : s))
      );
      setView('list');
      setActiveSkillId(null);
      setFileTree([]);
      setSelectedFile(null);
      setEditorContent('');
      setDirty(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSkillId, messages]);

  // ── 新建技能 ─────────────────────────────────────────────────────────────────
  const createNewSkill = useCallback(() => {
    const newSkill: Skill = {
      id: `new-${Date.now()}`,
      name: '新建技能',
      description: '描述待补充...',
      updatedAt: new Date().toISOString(),
      messages: [{ ...NEW_SKILL_WELCOME_MSG }],
    };
    setSkills((prev) => [newSkill, ...prev]);
    openSkill(newSkill);
  }, [openSkill]);

  // ── 对话发送 ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim()) return;
      const userMsg: ChatMessage = { id: Date.now(), role: 'user', text: inputValue };
      setMessages((prev) => [...prev, userMsg]);
      setInputValue('');
      setIsTyping(true);
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: 'assistant',
            text: '好的，我记录下了这个需求。为了让 `SKILL.md` 更完善，你期望这个功能最终交付的产物是什么格式？',
          },
        ]);
        setIsTyping(false);
      }, 1500);
    },
    [inputValue]
  );

  const activeSkill = skills.find((s) => s.id === activeSkillId) ?? null;
  const canSave =
    !!selectedFile &&
    selectedFile.path !== null &&
    isTextFile(selectedFile.name) &&
    saveStatus !== 'saving';

  return {
    // 列表
    view, skills, loading, loadError, activeSkill,
    // 文件树
    fileTree, fileTreeLoading, selectedFile, handleSelectFile,
    // 编辑器
    editorContent, handleEditorChange,
    fileLoading, saveStatus, canSave, isDirty,
    viewMode, setViewMode,
    handleSave,
    // 未保存对话框
    showUnsavedDialog, saveAndProceed, confirmDiscard, cancelUnsaved,
    // 对话
    messages, inputValue, setInputValue, isTyping, messagesEndRef, handleSubmit,
    // 导航
    openSkill, requestCloseEditor, createNewSkill,
  };
}
