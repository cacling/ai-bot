/**
 * SandboxPanel.tsx — 沙箱测试面板
 * 嵌入 SkillManagerPage，提供 Skill 文件的隔离测试环境。
 *
 * 流程：创建沙箱 → 编辑 → 测试对话 → 校验 → 发布/丢弃
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  FlaskConical, Send, Loader2, CheckCircle2, AlertTriangle,
  Trash2, Upload, X, User, Bot, ShieldCheck,
} from 'lucide-react';

interface SandboxPanelProps {
  filePath: string | null;
  onPublishDone?: () => void;
  onClose: () => void;
  /** 外部传入的 sandbox ID（由 PipelinePanel 管理时使用） */
  externalSandboxId?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  text: string;
}

interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
}

export function SandboxPanel({ filePath, onPublishDone, onClose, externalSandboxId }: SandboxPanelProps) {
  const [sandboxId, setSandboxId] = useState<string | null>(externalSandboxId ?? null);
  const [creating, setCreating] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [validating, setValidating] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreate = async () => {
    if (!filePath) return;
    setCreating(true);
    try {
      const res = await fetch('/api/sandbox/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: filePath }),
      });
      const data = await res.json();
      setSandboxId(data.id ?? data.sandbox_id);
      setMessages([]);
      setIssues([]);
    } catch (err: any) {
      alert(`创建沙箱失败: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleSendMessage = async () => {
    const text = input.trim();
    if (!text || !sandboxId || sending) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch(`/api/sandbox/${sandboxId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString() + 'r', role: 'bot', text: data.response ?? data.message ?? '(空回复)' },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString() + 'e', role: 'bot', text: `请求失败: ${err.message}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleValidate = async () => {
    if (!sandboxId) return;
    setValidating(true);
    setIssues([]);
    try {
      const res = await fetch(`/api/sandbox/${sandboxId}/validate`, {
        method: 'POST',
      });
      const data = await res.json();
      setIssues(data.issues ?? []);
    } catch (err: any) {
      setIssues([{ level: 'error', message: `校验请求失败: ${err.message}` }]);
    } finally {
      setValidating(false);
    }
  };

  const handlePublish = async () => {
    if (!sandboxId) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/sandbox/${sandboxId}/publish`, { method: 'POST' });
      if (res.ok) {
        setSandboxId(null);
        setMessages([]);
        setIssues([]);
        setShowPublishConfirm(false);
        onPublishDone?.();
      } else {
        const data = await res.json();
        alert(`发布失败: ${data.detail ?? data.message ?? '未知错误'}`);
      }
    } catch (err: any) {
      alert(`发布失败: ${err.message}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleDiscard = async () => {
    if (!sandboxId) return;
    setDiscarding(true);
    try {
      await fetch(`/api/sandbox/${sandboxId}`, { method: 'DELETE' });
      setSandboxId(null);
      setMessages([]);
      setIssues([]);
    } catch (err: any) {
      alert(`丢弃失败: ${err.message}`);
    } finally {
      setDiscarding(false);
    }
  };

  const isSandboxMode = !!sandboxId;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-10 border-b border-slate-200 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <FlaskConical size={12} className="text-amber-500" />
          <span className="text-xs font-semibold text-slate-700">沙箱测试</span>
          {isSandboxMode ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
              沙箱模式
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              生产模式
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 transition">
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!isSandboxMode ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <FlaskConical size={32} className="text-slate-300" />
            <p className="text-xs text-slate-400 text-center">
              创建沙箱后可在隔离环境中测试技能
            </p>
            <button
              onClick={handleCreate}
              disabled={creating || !filePath}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition"
            >
              {creating ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
              创建沙箱
            </button>
            {!filePath && (
              <p className="text-[10px] text-slate-400">请先选择文件</p>
            )}
          </div>
        ) : (
          <>
            {/* Chat messages */}
            {messages.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">
                发送消息测试当前技能
              </p>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-emerald-100 text-emerald-600'
                  }`}
                >
                  {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                </div>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-slate-100 text-slate-700 rounded-tl-none'
                  }`}
                >
                  {msg.text.split('\n').map((line, i) => (
                    <p key={i} className="mb-0.5 last:mb-0">{line}</p>
                  ))}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 size={12} className="animate-spin" />
                回复中…
              </div>
            )}

            {/* Validation issues */}
            {issues.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="text-xs font-medium text-slate-600 bg-slate-50 px-3 py-1.5 border-b border-slate-200">
                  校验结果
                </div>
                <div className="p-2 space-y-1.5">
                  {issues.map((issue, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-1.5 text-xs ${
                        issue.level === 'error'
                          ? 'text-red-600'
                          : issue.level === 'warning'
                          ? 'text-amber-600'
                          : 'text-slate-500'
                      }`}
                    >
                      {issue.level === 'error' ? (
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
                      )}
                      <span>{issue.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div ref={endRef} />
          </>
        )}
      </div>

      {/* Sandbox Controls + Input */}
      {isSandboxMode && (
        <>
          {/* Chat input */}
          <div className="px-2 pt-2 border-t border-slate-200">
            <div className="flex items-end gap-1.5">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="输入测试消息…"
                rows={2}
                className="flex-1 resize-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-slate-50"
                spellCheck={false}
              />
              <button
                onClick={handleSendMessage}
                disabled={!input.trim() || sending}
                className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="p-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
            <button
              onClick={handleValidate}
              disabled={validating}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            >
              {validating ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
              校验
            </button>
            <button
              onClick={() => setShowPublishConfirm(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
            >
              <Upload size={12} /> 发布
            </button>
            <button
              onClick={handleDiscard}
              disabled={discarding}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition"
            >
              {discarding ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              丢弃
            </button>
          </div>
        </>
      )}

      {/* Publish confirmation dialog */}
      {showPublishConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-5 w-72 flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-800 text-sm">确认发布？</p>
                <p className="text-xs text-slate-500 mt-1">
                  沙箱中的修改将覆盖生产文件，此操作不可撤销。
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="flex-1 px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 transition"
              >
                {publishing ? '发布中…' : '确认发布'}
              </button>
              <button
                onClick={() => setShowPublishConfirm(false)}
                className="flex-1 px-3 py-2 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
