/**
 * NLEditPanel.tsx — 自然语言配置编辑面板
 * 嵌入 SkillManagerPage 右侧，通过对话式交互完成 Skill 文件修改。
 *
 * 流程：输入需求 → clarify 循环 → edit 预览 Diff → 确认应用
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Check, X, Sparkles, User, Bot } from 'lucide-react';

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
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-10 border-b border-slate-200 flex items-center justify-between px-3 shrink-0">
        <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <Sparkles size={12} className="text-indigo-500" />
          AI 编辑
        </span>
        <button
          onClick={handleReset}
          className="text-xs text-slate-400 hover:text-slate-600 transition"
        >
          重置
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-8">
            输入自然语言描述，AI 将帮你修改文件
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

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 size={12} className="animate-spin" />
            处理中…
          </div>
        )}

        {/* Diff Preview */}
        {diff && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="text-xs font-medium text-slate-600 bg-slate-50 px-3 py-1.5 border-b border-slate-200">
              修改预览
            </div>
            <div className="grid grid-cols-2 text-xs font-mono leading-relaxed max-h-60 overflow-auto">
              <div className="bg-red-50 p-2 border-r border-slate-200">
                <div className="text-[10px] font-sans text-red-400 mb-1">删除</div>
                <pre className="whitespace-pre-wrap text-red-700">{diff.old_fragment || '(空)'}</pre>
              </div>
              <div className="bg-green-50 p-2">
                <div className="text-[10px] font-sans text-green-400 mb-1">新增</div>
                <pre className="whitespace-pre-wrap text-green-700">{diff.new_fragment || '(空)'}</pre>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-50 border-t border-slate-200">
              <button
                onClick={handleApply}
                disabled={applying}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition"
              >
                {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                应用
              </button>
              <button
                onClick={() => setDiff(null)}
                className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-100 transition"
              >
                <X size={12} /> 取消
              </button>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-slate-200">
        <div className="flex items-end gap-1.5">
          <textarea
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
            className="flex-1 resize-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-slate-50"
            spellCheck={false}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
