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
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
      className="bg-background rounded-xl border p-5 hover:border-primary hover:shadow-md transition-all cursor-pointer group flex flex-col h-48"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 bg-primary/10 text-primary rounded-lg group-hover:bg-primary/20 transition-colors">
          <Book className="w-5 h-5" />
        </div>
        <h3 className="font-semibold truncate">{skill.name}</h3>
      </div>
      <p className="text-sm text-muted-foreground line-clamp-3 flex-1">{skill.description}</p>
      <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          更新于 {relativeTime(skill.updatedAt)}
        </div>
        <span className="text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
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
      <span className="flex items-center text-xs text-muted-foreground gap-1">
        <Loader2 size={12} className="animate-spin" /> 保存中…
      </span>
    );
  if (status === 'saved')
    return (
      <span className="flex items-center text-xs text-primary gap-1">
        <CheckCircle2 size={12} /> 已保存
      </span>
    );
  if (status === 'error')
    return (
      <span className="flex items-center text-xs text-destructive gap-1">
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
    <Button
      variant={viewMode === 'preview' ? 'secondary' : 'outline'}
      size="xs"
      onClick={() => onChange(viewMode === 'preview' ? 'edit' : 'preview')}
      title="切换预览"
    >
      <Eye size={12} /> 预览
    </Button>
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
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <DialogTitle className="text-sm">有未保存的修改</DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">离开后当前编辑内容将丢失，是否先保存？</p>
            </div>
          </div>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-2">
          <Button onClick={onSave}>保存并离开</Button>
          <Button variant="outline" onClick={onDiscard}>不保存直接离开</Button>
          <Button variant="ghost" onClick={onCancel}>取消</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
