/**
 * useSkillManager.ts — 技能管理页面的全部逻辑
 *
 * 左栏对话已连接 POST /api/skill-creator/chat，支持多轮需求访谈 + SKILL.md 生成。
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

type Phase = 'interview' | 'draft' | 'confirm' | 'done';

interface Draft {
  skill_name: string;
  skill_md: string;
  references: Array<{ filename: string; content: string }>;
  description: string;
}

// ── 内存模板（新建技能）──────────────────────────────────────────────────────

const NEW_SKILL_WELCOME_MSG: ChatMessage = {
  id: 1,
  role: 'assistant',
  text: '你好！我来帮你**创建新技能**。\n\n请描述一下这个技能的目标场景，比如：让 AI 扮演什么角色、处理什么类型的用户问题？',
};

function makeExistingSkillMsg(meta: SkillMeta): ChatMessage {
  return {
    id: 1,
    role: 'assistant',
    text: `已进入「**${meta.name}**」的编辑模式。\n\n**当前描述**：${meta.description || '（暂无描述）'}\n\n请直接告诉我你想修改什么，比如：调整话术、修改流程步骤、新增处理分支等。`,
  };
}

const NEW_SKILL_TREE: SkillFileNode[] = [
  {
    name: 'SKILL.md',
    type: 'file',
    path: null,
    content:
      '---\nname: new-skill\ndescription: 待定义\nmetadata:\n  version: "1.0.0"\n  tags: []\n  mode: inbound\n  trigger: user_intent\n  channels: ["online"]\n---\n# 新技能\n\n通过左侧对话描述你的需求，AI 将自动生成技能定义。',
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

  // skill-creator 会话状态
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('capture');
  const [draft, setDraft] = useState<Draft | null>(null);

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

  function setDirtyState(v: boolean) {
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
    setDirtyState(false);
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
    setDirtyState(false);

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
        setDirtyState(false);
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
    setDirtyState(true);
  }, []);

  // ── 保存 ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedFile || selectedFile.path === null || !isTextFile(selectedFile.name)) return;
    setSaveStatus('saving');
    try {
      await saveFileContent(selectedFile.path, editorContent);
      lastSavedContentRef.current = editorContent;
      setDirtyState(false);
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
        setDirtyState(false);
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
    setDirtyState(false);
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
    setSessionId(null); // 重置会话
    setPhase('interview');
    setDraft(null);
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
      setSessionId(null);
      setPhase('interview');
      setDraft(null);
      setFileTree([]);
      setSelectedFile(null);
      setEditorContent('');
      setDirtyState(false);
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

  // ── 当 draft 更新时，同步到右侧编辑器和文件树 ──────────────────────────────
  function applyDraftToEditor(newDraft: Draft) {
    // 更新编辑器内容
    setEditorContent(newDraft.skill_md);
    lastSavedContentRef.current = ''; // 标记为未保存
    setDirtyState(true);

    // 更新内存文件树的 SKILL.md 内容
    setFileTree((prev) => {
      const updated = [...prev];
      const skillMdNode = updated.find((n) => n.name === 'SKILL.md');
      if (skillMdNode) {
        skillMdNode.content = newDraft.skill_md;
      }

      // 更新 references 子目录
      const refDir = updated.find((n) => n.name === 'references' && n.type === 'dir');
      if (refDir && newDraft.references?.length > 0) {
        refDir.children = newDraft.references.map((ref) => ({
          name: ref.filename,
          type: 'file' as const,
          path: null,
          content: ref.content,
        }));
      }

      return updated;
    });
  }

  // ── 对话发送（连接 skill-creator API）────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || isTyping) return;

      const userMsg: ChatMessage = { id: Date.now(), role: 'user', text: inputValue };
      setMessages((prev) => [...prev, userMsg]);
      setInputValue('');
      setIsTyping(true);

      try {
        const isNew = activeSkillId?.startsWith('new-');
        const res = await fetch('/api/skill-creator/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: inputValue,
            session_id: sessionId,
            skill_id: isNew ? null : activeSkillId,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json() as {
          session_id: string;
          reply: string;
          phase: Phase;
          draft: Draft | null;
        };

        setSessionId(data.session_id);
        setPhase(data.phase);

        // 显示 AI 回复
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), role: 'assistant', text: data.reply },
        ]);

        // 如果有 draft，实时更新右侧编辑器
        if (data.draft) {
          setDraft(data.draft);
          applyDraftToEditor(data.draft);
        }
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: 'assistant',
            text: `请求失败: ${err.message ?? '未知错误'}。请重试。`,
          },
        ]);
      } finally {
        setIsTyping(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputValue, isTyping, activeSkillId, sessionId]
  );

  // ── 发布新技能（将 draft 写入磁盘）─────────────────────────────────────────
  const publishSkill = useCallback(async () => {
    if (!draft) return;

    setSaveStatus('saving');
    try {
      const res = await fetch('/api/skill-creator/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          skill_name: draft.skill_name,
          skill_md: draft.skill_md,
          references: draft.references,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { ok: boolean; skill_id: string; is_new: boolean };

      // 添加确认消息
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'assistant',
          text: data.is_new
            ? `技能「**${draft.skill_name}**」已成功创建并保存！你可以在右侧编辑器中继续微调，或通过沙箱测试验证效果。`
            : `技能「**${draft.skill_name}**」已成功更新！`,
        },
      ]);

      // 刷新技能列表
      const metas = await fetchSkillList();
      setSkills(metas.map((m) => ({ ...m, messages: [makeExistingSkillMsg(m)] })));

      // 切换到已保存的技能
      const savedSkill = metas.find((m) => m.id === data.skill_id);
      if (savedSkill) {
        setActiveSkillId(savedSkill.id);
        // 重新加载文件树
        const nodes = await fetchSkillFiles(savedSkill.id);
        setFileTree(nodes);
        const skillMd = nodes.find((n) => n.name === 'SKILL.md' && n.type === 'file');
        if (skillMd) doLoadFile(skillMd);
      }

      setPhase('done');
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setSaveStatus('error');
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'assistant',
          text: `保存失败: ${err.message ?? '未知错误'}`,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, sessionId]);

  const activeSkill = skills.find((s) => s.id === activeSkillId) ?? null;
  const canSave =
    !!selectedFile &&
    selectedFile.path !== null &&
    isTextFile(selectedFile.name) &&
    saveStatus !== 'saving';

  // 是否处于可发布状态（有 draft + phase 为 confirm 或 done）
  const canPublish = !!draft && (phase === 'confirm' || phase === 'done' || phase === 'draft');

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
    // skill-creator 状态
    phase, draft, canPublish, publishSkill,
    // 导航
    openSkill, requestCloseEditor, createNewSkill,
  };
}
