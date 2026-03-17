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

import React, { useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  Send, Bot, User, FileText, Folder, FileCode,
  ChevronRight, Sparkles, CheckCircle2, Plus,
  ArrowLeft, AlertCircle,
  Save, Mic, MicOff, History, Loader2,
  FlaskConical,
} from 'lucide-react';
import { VersionPanel } from '../components/VersionPanel';
import { SandboxPanel } from '../components/SandboxPanel';
import { InlineMarkdown, SkillCard, SaveIndicator, ViewToggle, UnsavedDialog } from '../components/SkillEditorWidgets';
import {
  useSkillManager,
  isMdFile,
  isTextFile,
  type SkillFileNode,
  type ViewMode,
} from '../hooks/useSkillManager';

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
  depth?: number;
}

function FileTreeNode({
  node,
  selectedPath,
  onSelect,
  depth = 0,
}: {
  node: SkillFileNode;
  selectedPath: string | null;
  onSelect: (n: SkillFileNode) => void;
  depth: number;
}) {
  const [open, setOpen] = React.useState(true);
  const isActive = node.path !== null && node.path === selectedPath;
  const isDir = node.type === 'dir';
  const isClickable = !isDir;

  return (
    <div>
      <div
        onClick={() => {
          if (isDir) setOpen((o) => !o);
          else onSelect(node);
        }}
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        className={`flex items-center gap-1.5 pr-2 py-1 rounded text-sm cursor-pointer select-none
          ${isActive
            ? 'bg-indigo-100 text-indigo-700 font-medium'
            : isClickable
            ? 'text-slate-600 hover:bg-slate-100'
            : 'text-slate-500 hover:bg-slate-50'
          }`}
      >
        {isDir && (
          <ChevronRight
            className={`w-3 h-3 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          />
        )}
        {!isDir && <div className="w-3 flex-shrink-0" />}
        <FileIcon name={node.name} type={node.type} />
        <span className="truncate">{node.name}</span>
      </div>

      {isDir && open && node.children && node.children.length > 0 && (
        <div className="border-l border-slate-200 ml-5">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path ?? child.name}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileTree({ nodes, selectedPath, onSelect }: FileTreeProps) {
  if (nodes.length === 0) return null;
  return (
    <div className="py-1">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path ?? node.name}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={0}
        />
      ))}
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

  // ── 版本历史面板 ─────────────────────────────────────────────────────────────
  const [showVersions, setShowVersions] = useState(false);
  const [showSandbox, setShowSandbox] = useState(false);
  const handleRollbackDone = useCallback(() => {
    // 回滚成功后重新选中当前文件以刷新编辑器内容
    if (selectedFile) handleSelectFile(selectedFile);
  }, [selectedFile, handleSelectFile]);
  const handleApplyOrPublishDone = useCallback(() => {
    if (selectedFile) handleSelectFile(selectedFile);
  }, [selectedFile, handleSelectFile]);

  // ── 列表视图 ────────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="min-h-full bg-slate-50 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-indigo-600" />
                我的技能库 (Skills)
              </h1>
              <p className="text-slate-500 mt-1 text-sm">管理和持续迭代你的 AI 技能资产</p>
            </div>
            <button
              onClick={createNewSkill}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> 新建 SKILL
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">加载技能列表…</span>
            </div>
          )}
          {!loading && loadError && (
            <div className="flex items-center gap-2 text-red-500 text-sm py-8">
              <AlertCircle className="w-4 h-4" /> 加载失败：{loadError}
            </div>
          )}
          {!loading && !loadError && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {skills.map((skill) => (
                <SkillCard key={skill.id} skill={skill} onClick={() => openSkill(skill)} />
              ))}
              {skills.length === 0 && (
                <p className="col-span-3 text-center text-slate-400 text-sm py-16">
                  暂无技能，点击「新建 SKILL」开始创建
                </p>
              )}
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

      {/* ── 左栏：对话 ── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-slate-200 bg-white shadow-sm">

        {/* 头部 */}
        <div className="h-12 border-b border-slate-200 flex items-center px-3 gap-2 shrink-0">
          <button
            onClick={requestCloseEditor}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
            title="返回技能库"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span className="font-semibold text-slate-800 text-sm truncate">
            {activeSkill?.name ?? '技能编辑'}
          </span>
          {PHASE_LABELS[phase] && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PHASE_LABELS[phase].color}`}>
              {PHASE_LABELS[phase].label}
            </span>
          )}
        </div>

        {/* 对话消息 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-slate-50/50">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0
                  ${msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}
              >
                {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm
                  ${msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'
                  }`}
              >
                <InlineMarkdown text={msg.text} />
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-3 py-2 flex items-center gap-1 shadow-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 发布按钮（当有 draft 可发布时显示）*/}
        {canPublish && (
          <div className="px-3 py-2 bg-green-50 border-t border-green-200">
            <button
              onClick={publishSkill}
              disabled={saveStatus === 'saving'}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 transition"
            >
              {saveStatus === 'saving' ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中…</>
              ) : (
                <><CheckCircle2 className="w-3.5 h-3.5" /> 保存技能到磁盘</>
              )}
            </button>
          </div>
        )}

        {/* 输入框 */}
        <div className="p-3 bg-white border-t border-slate-200">
          <form onSubmit={handleSubmit}>
            <div className="rounded-xl border border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 bg-slate-50 transition-all overflow-hidden">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (inputValue.trim() && !isTyping)
                      handleSubmit(e as any);
                  }
                }}
                placeholder="描述需求或补充修改…（Enter 发送，Shift+Enter 换行）"
                rows={5}
                className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 outline-none text-xs text-slate-800 placeholder:text-slate-400 leading-relaxed"
                spellCheck={false}
              />
              <div className="flex items-center justify-between px-2 pb-2">
                <button
                  type="button"
                  onClick={toggleVoice}
                  title={isRecording ? '停止录音' : '语音输入'}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                    isRecording
                      ? 'bg-red-50 text-red-500 animate-pulse'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  {isRecording ? '停止' : '语音'}
                </button>
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* ── 右侧：文件树 + 编辑区 ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* 文件树 */}
        <div className="w-52 flex-shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider flex-shrink-0">
            文件
          </div>
          <div className="flex-1 overflow-y-auto">
            {fileTreeLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400 gap-1.5">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">加载中…</span>
              </div>
            ) : (
              <FileTree
                nodes={fileTree}
                selectedPath={selectedFile?.path ?? null}
                onSelect={handleSelectFile}
              />
            )}
          </div>
        </div>

        {/* 编辑区 */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">

          {/* 工具栏 */}
          <div className="h-10 border-b border-slate-200 flex items-center justify-between px-3 shrink-0">
            <span className="text-xs text-slate-500 truncate flex items-center gap-1.5">
              {selectedFile ? selectedFile.name : ''}
              {isDirty && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" title="有未保存修改" />
              )}
            </span>
            <div className="flex items-center gap-2">
              <SaveIndicator status={saveStatus} />
              {selectedIsMd && (
                <ViewToggle viewMode={viewMode} onChange={setViewMode} />
              )}
              {selectedIsMd && (
                <button
                  onClick={() => setShowVersions(!showVersions)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition ${
                    showVersions
                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <History size={12} /> 版本
                </button>
              )}
<button
                onClick={() => setShowSandbox(!showSandbox)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition ${
                  showSandbox
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FlaskConical size={12} /> 沙箱测试
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <Save size={12} /> 保存
              </button>
            </div>
          </div>

          {/* 内容区 + 版本面板 */}
          <div className="flex-1 overflow-hidden flex">
            {/* 编辑器主区域 */}
            <div className={`flex-1 overflow-hidden ${showVersions ? 'border-r border-gray-200' : ''}`}>

              {/* 加载中 */}
              {fileLoading && (
                <div className="flex items-center justify-center h-full text-slate-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">加载中…</span>
                </div>
              )}

              {/* .md 文件 — 编辑模式（默认）*/}
              {!fileLoading && selectedFile && selectedIsMd && viewMode === 'edit' && (
                <textarea
                  className="w-full h-full resize-none font-mono text-sm leading-relaxed p-4 outline-none bg-white text-slate-800"
                  value={editorContent}
                  onChange={(e) => handleEditorChange(e.target.value)}
                  spellCheck={false}
                />
              )}

              {/* .md 文件 — 预览模式 */}
              {!fileLoading && selectedFile && selectedIsMd && viewMode === 'preview' && (
                <div className="h-full overflow-y-auto px-6 py-4 prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{editorContent}</ReactMarkdown>
                </div>
              )}

              {/* 代码文件 — CodeMirror 编辑器 */}
              {!fileLoading && selectedFile && !selectedIsMd && isTextFile(selectedFile.name) && (
                <div className="h-full overflow-auto">
                  <CodeMirror
                    value={editorContent}
                    height="100%"
                    theme={oneDark}
                    extensions={getCodeMirrorLang(selectedFile.name)
                      ? [getCodeMirrorLang(selectedFile.name)!]
                      : []}
                    onChange={handleEditorChange}
                    basicSetup={{ lineNumbers: true, foldGutter: true }}
                    style={{ fontSize: '13px', height: '100%' }}
                  />
                </div>
              )}

              {/* 不支持的文件类型 */}
              {!fileLoading && selectedFile && !selectedIsMd && !isTextFile(selectedFile.name) && (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm gap-2">
                  <AlertCircle size={16} />
                  不支持预览此文件类型
                </div>
              )}
            </div>

            {/* 版本历史侧栏 */}
            {showVersions && (
              <div className="w-72 shrink-0">
                <VersionPanel
                  filePath={selectedFile?.path ?? null}
                  onClose={() => setShowVersions(false)}
                  onRollback={handleRollbackDone}
                />
              </div>
            )}

{/* 沙箱测试侧栏 */}
            {showSandbox && (
              <div className="w-80 shrink-0 border-l border-slate-200 relative">
                <SandboxPanel
                  filePath={selectedFile?.path ?? null}
                  onPublishDone={handleApplyOrPublishDone}
                  onClose={() => setShowSandbox(false)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
