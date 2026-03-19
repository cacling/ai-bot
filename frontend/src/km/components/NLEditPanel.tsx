/**
 * NLEditPanel.tsx — 自然语言配置编辑面板
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Check, X, Sparkles, User, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface NLEditPanelProps {
  onApplyDone?: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'system';
  text: string;
}

interface DiffResult {
  old_fragment: string;
  new_fragment: string;
  file_path: string;
  session_id: string;
}

export function NLEditPanel({ onApplyDone }: NLEditPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, diff]);

  const addMessage = (role: 'user' | 'system', text: string) => {
    setMessages((prev) => [...prev, { id: Date.now().toString() + Math.random(), role, text }]);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    addMessage('user', text);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/skill-edit/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });
      const data = await res.json();

      if (data.session_id) setSessionId(data.session_id);

      if (data.status === 'need_clarify') {
        const parts: string[] = [];
        if (data.question) parts.push(data.question);
        if (data.missing_items?.length) {
          parts.push('还需要以下信息：');
          data.missing_items.forEach((item: string) => parts.push(`  - ${item}`));
        }
        addMessage('system', parts.join('\n'));
      } else if (data.status === 'ready') {
        addMessage('system', '需求已明确，正在生成修改方案…');
        await generateDiff(data.session_id ?? sessionId);
      } else {
        addMessage('system', data.message ?? '收到回复');
      }
    } catch (err: any) {
      addMessage('system', `请求失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const generateDiff = async (sid: string | null) => {
    setLoading(true);
    try {
      const res = await fetch('/api/skill-edit/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid }),
      });
      const data = await res.json();
      setDiff({
        old_fragment: data.old_fragment ?? '',
        new_fragment: data.new_fragment ?? '',
        file_path: data.file_path ?? '',
        session_id: sid ?? '',
      });
      addMessage('system', '已生成修改预览，请确认后应用。');
    } catch (err: any) {
      addMessage('system', `生成 Diff 失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!diff) return;
    setApplying(true);
    try {
      const res = await fetch('/api/skill-edit/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: diff.session_id,
          old_fragment: diff.old_fragment,
          new_fragment: diff.new_fragment,
          file_path: diff.file_path,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        addMessage('system', '修改已成功应用！');
        setDiff(null);
        onApplyDone?.();
      } else {
        addMessage('system', `应用失败: ${data.detail ?? data.message ?? '未知错误'}`);
      }
    } catch (err: any) {
      addMessage('system', `应用失败: ${err.message}`);
    } finally {
      setApplying(false);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setDiff(null);
    setSessionId(null);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="h-10 border-b flex items-center justify-between px-3 shrink-0">
        <span className="text-xs font-semibold flex items-center gap-1.5">
          <Sparkles size={12} className="text-primary" />
          AI 编辑
        </span>
        <Button variant="ghost" size="xs" onClick={handleReset}>重置</Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            输入自然语言描述，AI 将帮你修改文件
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

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            处理中…
          </div>
        )}

        {/* Diff Preview */}
        {diff && (
          <div className="border rounded-lg overflow-hidden">
            <div className="text-xs font-medium bg-background px-3 py-1.5 border-b">
              修改预览
            </div>
            <div className="grid grid-cols-2 text-xs font-mono leading-relaxed max-h-60 overflow-auto">
              <div className="bg-destructive/10 p-2 border-r">
                <div className="text-[10px] font-sans text-destructive mb-1">删除</div>
                <pre className="whitespace-pre-wrap text-destructive">{diff.old_fragment || '(空)'}</pre>
              </div>
              <div className="bg-primary/10 p-2">
                <div className="text-[10px] font-sans text-primary mb-1">新增</div>
                <pre className="whitespace-pre-wrap text-primary">{diff.new_fragment || '(空)'}</pre>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-background border-t">
              <Button size="sm" onClick={handleApply} disabled={applying}>
                {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                应用
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDiff(null)}>
                <X size={12} /> 取消
              </Button>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t">
        <div className="flex items-end gap-1.5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="描述你想做的修改…"
            rows={2}
            className="flex-1 min-h-0 resize-none px-2.5 py-1.5 text-xs bg-background"
            spellCheck={false}
          />
          <Button size="icon-sm" onClick={handleSend} disabled={!input.trim() || loading}>
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
