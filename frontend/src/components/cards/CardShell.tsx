/**
 * CardShell.tsx — generic draggable card wrapper
 *
 * Provides: gradient header, grip handle, collapse/close, drag-and-drop hooks.
 * The specific card content is rendered via `def.component`.
 */

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

export function CardShell({
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
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={[
        'flex flex-col rounded-2xl shadow-md border border-gray-200 overflow-hidden bg-white transition-all',
        isDragging ? 'opacity-40 scale-[0.98]' : '',
        isDragOver ? 'ring-2 ring-blue-400 ring-offset-1' : '',
      ].join(' ')}
    >
      {/* Header */}
      <div className={`flex items-center px-3 py-2.5 flex-shrink-0 ${def.headerClass}`}>
        {/* Drag handle */}
        <GripVertical
          size={14}
          className="text-white/50 hover:text-white/80 cursor-grab active:cursor-grabbing mr-1.5 flex-shrink-0"
        />

        {/* Icon + title */}
        <def.Icon size={14} className="text-white mr-1.5 flex-shrink-0" />
        <span className="text-xs font-semibold text-white flex-1 truncate">{title}</span>

        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className="text-white/60 hover:text-white/90 transition ml-1 flex-shrink-0"
          title={state.isCollapsed ? '展开' : '收起'}
        >
          {state.isCollapsed
            ? <ChevronDown size={14} />
            : <ChevronUp   size={14} />}
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white/90 transition ml-1 flex-shrink-0"
          title="关闭"
        >
          <X size={14} />
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
}
