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
  role: 'user' | 'assistant' | 'system';
  text: string;
  thinking?: string | null;
  image?: string; // base64 图片预览（仅用户消息）
}

export interface Skill extends SkillMeta {
  messages: ChatMessage[];
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
/** edit = 纯 textarea；preview = 只读渲染 */
export type ViewMode = 'edit' | 'preview';
export type SkillManagerView = 'list' | 'editor';

type Phase = 'capture' | 'interview' | 'draft' | 'confirm' | 'done';

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

async function deleteSkillApi(id: string): Promise<void> {
  const res = await fetch(`/api/skills/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
}

async function saveDraft(path: string, content: string): Promise<void> {
  await fetch('/api/files/draft', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
}

async function deleteDraft(path: string): Promise<void> {
  await fetch(`/api/files/draft?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
}

// ── 自定义 Hook ───────────────────────────────────────────────────────────────

export function useSkillManager(lang: 'zh' | 'en' = 'zh') {
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
  const [pendingImage, setPendingImage] = useState<string | null>(null); // objectURL for preview
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null); // actual File for upload

  // skill-creator 会话状态
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('capture');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showThinking, setShowThinking] = useState(true);
  // AI 助手当前操作的版本号（由页面同步设置，切换版本时重置会话）
  const [chatVersionNo, _setChatVersionNo] = useState<number | null>(null);
  const chatVersionRef = useRef<number | null>(null);
  const prevChatVersionRef = useRef<number | null>(null);
  // 同步更新 state + ref，确保 handleSubmit 闭包中始终用最新值
  const setChatVersionNo = useCallback((v: number | null) => {
    chatVersionRef.current = v;
    _setChatVersionNo(v);
  }, []);

  // 文件树
  const [fileTree, setFileTree] = useState<SkillFileNode[]>([]);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);

  // 当前文件 & 编辑器
  const [selectedFile, setSelectedFile] = useState<SkillFileNode | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const selectedFileRef = useRef<SkillFileNode | null>(null);
  const editorContentRef = useRef('');
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

  // ── 切换版本时重置 AI 助手会话 ─────────────────────────────────────────────
  useEffect(() => {
    if (chatVersionNo === prevChatVersionRef.current) return;
    prevChatVersionRef.current = chatVersionNo;
    // 版本切换 → 清空 AI 助手会话，避免跨版本对话混淆
    if (chatVersionNo !== null && activeSkillId && !activeSkillId.startsWith('new-')) {
      const skill = skills.find(s => s.id === activeSkillId);
      setMessages(skill ? [makeExistingSkillMsg(skill)] : []);
      setSessionId(null);
      setPhase('interview');
      setDraft(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatVersionNo]);

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
    selectedFileRef.current = node;
    setSaveStatus('idle');
    setDirtyState(false);

    if (node.path === null) {
      const content = node.content ?? '';
      setEditorContent(content);
      editorContentRef.current = content;
      lastSavedContentRef.current = content;
      return;
    }

    if (!isTextFile(node.name)) {
      setEditorContent('（二进制或不支持的文件类型）');
      lastSavedContentRef.current = '';
      return;
    }

    setFileLoading(true);
    // Fetch file content — API returns isDraft flag if .draft file exists
    fetch(`/api/files/content?path=${encodeURIComponent(node.path)}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: { content: string; isDraft?: boolean }) => {
        setEditorContent(data.content ?? '');
        editorContentRef.current = data.content;
        if (data.isDraft) {
          // Draft exists — mark as dirty so yellow dot shows
          lastSavedContentRef.current = ''; // force dirty
          setDirtyState(true);
        } else {
          lastSavedContentRef.current = data.content;
          setDirtyState(false);
        }
      })
      .catch((err) => setEditorContent(`// 加载失败: ${String(err)}`))
      .finally(() => setFileLoading(false));
  }

  // ── dirty guard：若有未保存修改则自动保存草稿，然后执行 ─────────────────────
  function guardDirty(action: () => void) {
    if (isDirtyRef.current && selectedFileRef.current?.path) {
      // Auto-save draft before switching (use refs for latest values)
      saveDraft(selectedFileRef.current.path, editorContentRef.current).catch(() => {});
    }
    action();
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
    editorContentRef.current = content;
    setDirtyState(true);
  }, []);

  const updateEditorContent = useCallback((updater: (current: string) => string) => {
    const next = updater(editorContentRef.current);
    setEditorContent(next);
    editorContentRef.current = next;
    setDirtyState(true);
  }, []);

  // ── 保存 ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedFile || selectedFile.path === null || !isTextFile(selectedFile.name)) return;
    setSaveStatus('saving');
    try {
      await saveFileContent(selectedFile.path, editorContent);
      // Delete draft after successful formal save
      await deleteDraft(selectedFile.path).catch(() => {});
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
    // 编辑已有技能时，清空创建态的历史消息，用编辑态欢迎语重新开始
    const isNew = skill.id.startsWith('new-');
    setMessages(isNew ? skill.messages : [makeExistingSkillMsg(skill)]);
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

  // ── 删除技能 ─────────────────────────────────────────────────────────────────
  const deleteSkill = useCallback(async (id: string) => {
    try {
      await deleteSkillApi(id);
      // 刷新列表
      const metas = await fetchSkillList();
      setSkills(metas.map((m) => ({ ...m, messages: [makeExistingSkillMsg(m)] })));
    } catch (err: any) {
      throw err; // 让调用方处理错误提示
    }
  }, []);

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
    editorContentRef.current = newDraft.skill_md;
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
      const hasText = inputValue.trim().length > 0;
      const hasImage = !!pendingImageFile;
      if ((!hasText && !hasImage) || isTyping) return;

      // 先捕获当前值再清空，避免闭包竞争
      const submittedText = inputValue;
      const submittedFile = pendingImageFile;
      const submittedPreview = pendingImage;
      setInputValue('');
      setPendingImage(null);
      setPendingImageFile(null);

      const userMsg: ChatMessage = {
        id: Date.now(),
        role: 'user',
        text: submittedText || (hasImage ? '（上传了一张流程图）' : ''),
        image: submittedPreview ?? undefined,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      const fetchStartTs = performance.now();
      try {
        const isNew = activeSkillId?.startsWith('new-');
        console.log('[skill-creator] sending chat request', {
          session_id: sessionId,
          enable_thinking: showThinking,
          has_image: !!submittedFile,
          message_len: submittedText.length,
        });

        let res: Response;
        if (submittedFile) {
          // 有图片时用 FormData 上传（避免 base64 膨胀）
          const formData = new FormData();
          formData.append('message', submittedText);
          formData.append('image', submittedFile);
          if (sessionId) formData.append('session_id', sessionId);
          if (!isNew && activeSkillId) formData.append('skill_id', activeSkillId);
          if (!isNew && chatVersionRef.current) formData.append('version_no', String(chatVersionRef.current));
          formData.append('enable_thinking', showThinking ? 'true' : 'false');
          formData.append('lang', lang);
          res = await fetch('/api/skill-creator/chat', { method: 'POST', body: formData });
        } else {
          // 无图片时用 JSON（现有逻辑）
          res = await fetch('/api/skill-creator/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: submittedText,
              session_id: sessionId,
              skill_id: isNew ? null : activeSkillId,
              version_no: isNew ? undefined : chatVersionRef.current ?? undefined,
              enable_thinking: showThinking,
              lang,
            }),
          });
        }

        console.log('[skill-creator] response received', {
          status: res.status,
          content_type: res.headers.get('content-type'),
          elapsed_ms: Math.round(performance.now() - fetchStartTs),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error ?? `HTTP ${res.status}`);
        }

        const contentType = res.headers.get('content-type') ?? '';

        // ── 流式模式（SSE）──
        if (contentType.includes('text/event-stream') && res.body) {
          const streamStartTs = performance.now();
          console.log('[skill-creator] SSE stream started');
          const msgId = Date.now();
          setMessages((prev) => [...prev, { id: msgId, role: 'assistant', text: '', thinking: '' }]);

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let sseEventCount = 0;
          let lastEventType = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              console.log('[skill-creator] SSE stream ended', {
                total_events: sseEventCount,
                last_event_type: lastEventType,
                stream_duration_ms: Math.round(performance.now() - streamStartTs),
                total_duration_ms: Math.round(performance.now() - fetchStartTs),
              });
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? '';

            for (const part of parts) {
              const line = part.trim();
              if (!line.startsWith('data: ')) continue;
              try {
                const data = JSON.parse(line.slice(6));
                sseEventCount++;
                lastEventType = data.type;

                // 对关键事件记录日志
                if (data.type === 'done' || data.type === 'error' || data.type === 'vision_result') {
                  console.log(`[skill-creator] SSE event: ${data.type}`, {
                    event_count: sseEventCount,
                    elapsed_ms: Math.round(performance.now() - streamStartTs),
                    ...(data.type === 'done' ? { phase: data.phase, has_draft: !!data.draft, reply_len: data.reply?.length } : {}),
                    ...(data.type === 'error' ? { error: data.error } : {}),
                  });
                } else if (sseEventCount === 1) {
                  console.log('[skill-creator] SSE first event', {
                    type: data.type,
                    time_to_first_event_ms: Math.round(performance.now() - streamStartTs),
                  });
                }

                if (data.type === 'vision_progress') {
                  // 大图处理进度：更新 AI 消息的占位文本
                  const progressLabels: Record<string, string> = {
                    trim: '正在裁剪空白区域…',
                    overview: '正在生成总览…',
                    slice: `正在解析切片 ${(data.current ?? 1) - 1}/${(data.total ?? 2) - 2}…`,
                    merge: '正在合并识别结果…',
                  };
                  setMessages((prev) => prev.map((m) =>
                    m.id === msgId ? { ...m, text: progressLabels[data.step] ?? '正在处理图片…' } : m
                  ));
                } else if (data.type === 'vision_result') {
                  // 图片解析结果：插入一条系统消息，在 AI 回复之前展示
                  setMessages((prev) => {
                    const aiMsgIndex = prev.findIndex(m => m.id === msgId);
                    const visionMsg: ChatMessage = { id: Date.now() - 1, role: 'system', text: data.text };
                    if (aiMsgIndex >= 0) {
                      const updated = [...prev];
                      updated.splice(aiMsgIndex, 0, visionMsg);
                      return updated;
                    }
                    return [...prev, visionMsg];
                  });
                } else if (data.type === 'thinking') {
                  setMessages((prev) => prev.map((m) =>
                    m.id === msgId ? { ...m, thinking: (m.thinking ?? '') + data.text } : m
                  ));
                } else if (data.type === 'done') {
                  setSessionId(data.session_id);
                  setPhase(data.phase);
                  setMessages((prev) => prev.map((m) =>
                    m.id === msgId ? { ...m, text: data.reply, thinking: data.thinking } : m
                  ));
                  if (data.draft) {
                    setDraft(data.draft);
                    applyDraftToEditor(data.draft);
                  }
                } else if (data.type === 'error') {
                  setMessages((prev) => prev.map((m) =>
                    m.id === msgId ? { ...m, text: `请求失败: ${data.error}。请重试。`, thinking: undefined } : m
                  ));
                }
              } catch (parseErr) {
                console.warn('[skill-creator] SSE parse error', { raw: line.slice(0, 200), error: String(parseErr) });
              }
            }
          }
        } else {
          // ── 非流式模式（JSON）──
          console.log('[skill-creator] non-streaming JSON response');
          const data = await res.json() as {
            session_id: string;
            reply: string;
            phase: Phase;
            draft: Draft | null;
            thinking?: string | null;
            vision_result?: string | null;
          };

          console.log('[skill-creator] JSON response parsed', {
            session_id: data.session_id,
            phase: data.phase,
            has_draft: !!data.draft,
            reply_len: data.reply?.length,
            has_thinking: !!data.thinking,
            has_vision: !!data.vision_result,
            total_duration_ms: Math.round(performance.now() - fetchStartTs),
          });

          setSessionId(data.session_id);
          setPhase(data.phase);

          const newMessages: ChatMessage[] = [];
          if (data.vision_result) {
            newMessages.push({ id: Date.now() - 1, role: 'system', text: data.vision_result });
          }
          newMessages.push({ id: Date.now(), role: 'assistant', text: data.reply, thinking: data.thinking });
          setMessages((prev) => [...prev, ...newMessages]);

          if (data.draft) {
            setDraft(data.draft);
            applyDraftToEditor(data.draft);
          }
        }
      } catch (err: any) {
        console.error('[skill-creator] request failed', {
          error: err.message,
          stack: err.stack?.slice(0, 300),
          elapsed_ms: Math.round(performance.now() - fetchStartTs),
        });
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
    [inputValue, isTyping, activeSkillId, sessionId, showThinking, pendingImageFile, chatVersionNo, lang]
  );

  // ── 发布新技能（将 draft 写入磁盘）─────────────────────────────────────────
  const publishSkill = useCallback(async () => {
    if (!draft) return;

    setSaveStatus('saving');
    try {
      const isNew = activeSkillId?.startsWith('new-');
      const res = await fetch('/api/skill-creator/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          skill_name: draft.skill_name,
          skill_md: draft.skill_md,
          references: draft.references,
          version_no: isNew ? undefined : chatVersionRef.current ?? undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as {
        ok: boolean; skill_id: string; is_new: boolean;
        tools_ready?: boolean;
        tool_warnings?: Array<{ tool: string; status: string; message: string }>;
      };

      // 构建确认消息（含工具状态警告）
      let confirmText = data.is_new
        ? `技能「**${draft.skill_name}**」已成功创建并保存！你可以在右侧编辑器中继续微调，或通过沙箱测试验证效果。`
        : `技能「**${draft.skill_name}**」已成功更新！`;

      if (data.tool_warnings && data.tool_warnings.length > 0) {
        confirmText += '\n\n⚠️ **工具就绪检查**：以下工具尚未就绪，技能运行时对应步骤将无法执行：\n';
        confirmText += data.tool_warnings.map(w =>
          `- **${w.tool}**（${w.status}）：${w.message}`
        ).join('\n');
        confirmText += '\n\n请前往「MCP 管理」创建或启用这些工具后再进行沙箱测试。';
      }

      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: 'assistant', text: confirmText },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, sessionId, chatVersionNo, activeSkillId]);

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
    editorContent, handleEditorChange, updateEditorContent,
    fileLoading, saveStatus, canSave, isDirty,
    viewMode, setViewMode,
    handleSave,
    // 未保存对话框
    showUnsavedDialog, saveAndProceed, confirmDiscard, cancelUnsaved,
    // 对话
    messages, inputValue, setInputValue, isTyping, messagesEndRef, handleSubmit,
    pendingImage, setPendingImage, pendingImageFile, setPendingImageFile,
    // skill-creator 状态
    phase, draft, canPublish, publishSkill,
    chatVersionNo, setChatVersionNo,
    // thinking 模式
    showThinking, setShowThinking,
    // 导航
    openSkill, requestCloseEditor, createNewSkill, deleteSkill,
  };
}
