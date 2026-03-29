/**
 * SandboxPanel.tsx — 沙箱测试面板
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  FlaskConical, Send, Loader2, CheckCircle2, AlertTriangle,
  Trash2, Upload, X, User, Bot, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface SandboxPanelProps {
  filePath: string | null;
  onPublishDone?: () => void;
  onClose: () => void;
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
      const res = await fetch(`/api/sandbox/${sandboxId}/validate`, { method: 'POST' });
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
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="h-10 border-b flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <FlaskConical size={12} className="text-muted-foreground" />
          <span className="text-xs font-semibold">沙箱测试</span>
          {isSandboxMode ? (
            <Badge variant="outline" className="text-[10px]">沙箱模式</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">生产模式</Badge>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose}><X size={14} /></Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!isSandboxMode ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <FlaskConical size={32} className="text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground text-center">
              创建沙箱后可在隔离环境中测试技能
            </p>
            <Button size="sm" onClick={handleCreate} disabled={creating || !filePath}>
              {creating ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
              创建沙箱
            </Button>
            {!filePath && (
              <p className="text-[10px] text-muted-foreground">请先选择文件</p>
            )}
          </div>
        ) : (
          <>
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                发送消息测试当前技能
              </p>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-accent text-accent-foreground'
                  }`}
                >
                  {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                </div>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-muted rounded-tl-none'
                  }`}
                >
                  {msg.text.split('\n').map((line, i) => (
                    <p key={i} className="mb-0.5 last:mb-0">{line}</p>
                  ))}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                回复中…
              </div>
            )}

            {issues.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="text-xs font-medium bg-background px-3 py-1.5 border-b">
                  校验结果
                </div>
                <div className="p-2 space-y-1.5">
                  {issues.map((issue, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-1.5 text-xs ${
                        issue.level === 'error'
                          ? 'text-destructive'
                          : issue.level === 'warning'
                          ? 'text-muted-foreground'
                          : 'text-muted-foreground'
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
          <div className="px-2 pt-2 border-t">
            <div className="flex items-end gap-1.5">
              <Textarea
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
                className="flex-1 min-h-0 resize-none px-2.5 py-1.5 text-xs bg-background"
                spellCheck={false}
              />
              <Button size="icon-sm" onClick={handleSendMessage} disabled={!input.trim() || sending}>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="p-2 border-t flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={handleValidate} disabled={validating}>
              {validating ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
              校验
            </Button>
            <Button size="sm" onClick={() => setShowPublishConfirm(true)}>
              <Upload size={12} /> 发布
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDiscard} disabled={discarding}>
              {discarding ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              丢弃
            </Button>
          </div>
        </>
      )}

      {/* Publish confirmation dialog */}
      {showPublishConfirm && (
        <Dialog open onOpenChange={(open) => { if (!open) setShowPublishConfirm(false); }}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <DialogTitle className="text-sm">确认发布？</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    沙箱中的修改将覆盖生产文件，此操作不可撤销。
                  </p>
                </div>
              </div>
            </DialogHeader>
            <div className="flex gap-2 mt-2">
              <Button className="flex-1" onClick={handlePublish} disabled={publishing}>
                {publishing ? '发布中…' : '确认发布'}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowPublishConfirm(false)}>
                取消
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
