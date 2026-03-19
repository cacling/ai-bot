/**
 * CardShell.tsx — generic draggable card wrapper
 *
 * Provides: gradient header, grip handle, collapse/close, drag-and-drop hooks.
 * The specific card content is rendered via `def.component`.
 *
 * Wrapped with React.memo — only re-renders when its own props change.
 */

import { memo, useMemo } from 'react';
import { GripVertical, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { CardDef, CardState } from './registry';
import type { Lang } from '../../i18n';

interface Props {
  def: CardDef;
  state: CardState;
  lang: Lang;
  onToggleCollapse: () => void;
  onClose: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isDragging: boolean;
  isDragOver: boolean;
}

export const CardShell = memo(function CardShell({
  def,
  state,
  lang,
  onToggleCollapse,
  onClose,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  isDragOver,
}: Props) {
  const Content = def.component;
  const title = def.title[lang];

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={[
        'flex flex-col rounded-2xl shadow-md border border-border overflow-hidden bg-background transition-all',
        isDragging ? 'opacity-40 scale-[0.98]' : '',
        isDragOver ? 'ring-2 ring-ring ring-offset-1' : '',
      ].join(' ')}
    >
      {/* Header — only this bar is draggable */}
      <div
        draggable
        onDragStart={onDragStart}
        className="flex items-center px-3 py-1.5 flex-shrink-0 cursor-grab active:cursor-grabbing bg-muted border-b border-border"
      >
        <GripVertical size={12} className="text-muted-foreground/50 hover:text-muted-foreground mr-1.5 flex-shrink-0" />
        <span className="text-[11px] font-medium text-muted-foreground flex-1 truncate">{title}</span>

        <button
          onClick={onToggleCollapse}
          className="text-muted-foreground hover:text-foreground transition ml-1 flex-shrink-0"
          title={state.isCollapsed ? '展开' : '收起'}
        >
          {state.isCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition ml-1 flex-shrink-0"
          title="关闭"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      {!state.isCollapsed && (
        <div className="flex-1 overflow-auto">
          <Content data={state.data} lang={lang} />
        </div>
      )}
    </div>
  );
});
