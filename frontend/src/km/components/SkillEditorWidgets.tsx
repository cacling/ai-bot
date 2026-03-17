/**
 * SkillEditorWidgets.tsx — 技能编辑器辅助组件
 *
 * InlineMarkdown, SkillCard, SaveIndicator, ViewToggle, UnsavedDialog
 */

import React from 'react';
import {
  Book, Clock, ChevronRight, CheckCircle2,
  Loader2, AlertTriangle, Eye,
} from 'lucide-react';
import { relativeTime, type Skill, type ViewMode } from '../hooks/useSkillManager';

// ── 对话气泡内联 Markdown ─────────────────────────────────────────────────────

export function InlineMarkdown({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g);
        return (
          <p key={i} className="mb-1 last:mb-0">
            {parts.map((part, j) => {
              if (part.startsWith('**') && part.endsWith('**'))
                return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>;
              if (part.startsWith('`') && part.endsWith('`'))
                return (
                  <code key={j} className="px-1 py-0.5 rounded bg-black/10 text-xs font-mono">
                    {part.slice(1, -1)}
                  </code>
                );
              return part;
            })}
          </p>
        );
      })}
    </>
  );
}

// ── 技能卡片 ──────────────────────────────────────────────────────────────────

export function SkillCard({ skill, onClick }: { skill: Skill; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group flex flex-col h-48"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-100 transition-colors">
          <Book className="w-5 h-5" />
        </div>
        <h3 className="font-semibold text-slate-800 truncate">{skill.name}</h3>
      </div>
      <p className="text-sm text-slate-600 line-clamp-3 flex-1">{skill.description}</p>
      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          更新于 {relativeTime(skill.updatedAt)}
        </div>
        <span className="text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          打开 <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}

// ── 保存状态指示 ──────────────────────────────────────────────────────────────

export function SaveIndicator({ status }: { status: string }) {
  if (status === 'saving')
    return (
      <span className="flex items-center text-xs text-slate-400 gap-1">
        <Loader2 size={12} className="animate-spin" /> 保存中…
      </span>
    );
  if (status === 'saved')
    return (
      <span className="flex items-center text-xs text-green-600 gap-1">
        <CheckCircle2 size={12} /> 已保存
      </span>
    );
  if (status === 'error')
    return (
      <span className="flex items-center text-xs text-red-500 gap-1">
        <AlertTriangle size={12} /> 保存失败
      </span>
    );
  return null;
}

// ── 视图模式切换 ──────────────────────────────────────────────────────────────

export function ViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <button
      onClick={() => onChange(viewMode === 'preview' ? 'edit' : 'preview')}
      title="切换预览"
      className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition ${
        viewMode === 'preview'
          ? 'bg-slate-100 border-slate-300 text-slate-800'
          : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Eye size={12} /> 预览
    </button>
  );
}

// ── 未保存离开对话框 ──────────────────────────────────────────────────────────

export function UnsavedDialog({
  onCancel,
  onDiscard,
  onSave,
}: {
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl p-6 w-80 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-slate-800 text-sm">有未保存的修改</p>
            <p className="text-xs text-slate-500 mt-1">离开后当前编辑内容将丢失，是否先保存？</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onSave}
            className="w-full px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
          >
            保存并离开
          </button>
          <button
            onClick={onDiscard}
            className="w-full px-4 py-2 bg-white text-slate-700 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition"
          >
            不保存直接离开
          </button>
          <button
            onClick={onCancel}
            className="w-full px-4 py-2 text-slate-400 text-sm hover:text-slate-600 transition"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
