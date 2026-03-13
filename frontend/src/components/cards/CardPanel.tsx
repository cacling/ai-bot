/**
 * CardPanel.tsx — right-panel card container
 *
 * Layout: 2-column CSS grid.
 * - colSpan:2 cards span full width (e.g. diagram)
 * - colSpan:1 cards occupy one column (e.g. emotion, handoff)
 *
 * Drag-to-reorder: swaps order values when a card is dropped onto another.
 */

import { useState } from 'react';
import { CardShell } from './CardShell';
import { getCardDef, getAllCardDefs, type CardState } from './registry';
import type { Lang } from '../../i18n';

interface Props {
  cards: CardState[];
  lang: Lang;
  onUpdate: (cards: CardState[]) => void;
}

export function CardPanel({ cards, lang, onUpdate }: Props) {
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dragOverId,  setDragOverId]  = useState<string | null>(null);

  const sorted = [...cards].sort((a, b) => a.order - b.order);
  const visible = sorted.filter(s => s.isOpen);

  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (id !== draggingId) setDragOverId(id);
  };

  const handleDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggingId || draggingId === targetId) { resetDrag(); return; }

    const fromCard = cards.find(c => c.id === draggingId);
    const toCard   = cards.find(c => c.id === targetId);
    if (!fromCard || !toCard) { resetDrag(); return; }

    // Swap orders
    const fromOrder = fromCard.order;
    const toOrder   = toCard.order;
    onUpdate(cards.map(c => {
      if (c.id === draggingId) return { ...c, order: toOrder };
      if (c.id === targetId)   return { ...c, order: fromOrder };
      return c;
    }));
    resetDrag();
  };

  const resetDrag = () => { setDraggingId(null); setDragOverId(null); };

  const toggleCollapse = (id: string) => {
    onUpdate(cards.map(c => c.id === id ? { ...c, isCollapsed: !c.isCollapsed } : c));
  };

  const closeCard = (id: string) => {
    onUpdate(cards.map(c => c.id === id ? { ...c, isOpen: false } : c));
  };

  // Cards that are closed can be re-opened via a small button row at bottom
  const closed = sorted.filter(s => !s.isOpen);

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* 2-column grid for open cards; dense flow fills gaps when col-span-2 items interrupt col-span-1 pairs */}
      <div className="grid grid-cols-2 gap-3 grid-flow-dense">
        {visible.map(state => {
          const def = getCardDef(state.id);
          if (!def) return null;
          return (
            <div
              key={state.id}
              className={def.colSpan === 2 ? 'col-span-2' : 'col-span-1'}
            >
              <CardShell
                def={def}
                state={state}
                lang={lang}
                onToggleCollapse={() => toggleCollapse(state.id)}
                onClose={() => closeCard(state.id)}
                onDragStart={handleDragStart(state.id)}
                onDragOver={handleDragOver(state.id)}
                onDrop={handleDrop(state.id)}
                isDragging={draggingId === state.id}
                isDragOver={dragOverId === state.id}
              />
            </div>
          );
        })}
      </div>

      {/* Closed-card restore chips */}
      {closed.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {closed.map(state => {
            const def = getCardDef(state.id);
            if (!def) return null;
            return (
              <button
                key={state.id}
                onClick={() => onUpdate(cards.map(c => c.id === state.id ? { ...c, isOpen: true } : c))}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-gray-200 shadow-sm text-[11px] text-gray-500 hover:text-gray-700 hover:border-gray-300 transition"
              >
                <def.Icon size={11} />
                <span>{def.title[lang]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state when all cards closed */}
      {visible.length === 0 && closed.length === 0 && (
        <div className="text-center text-xs text-gray-400 py-8">暂无卡片</div>
      )}
    </div>
  );
}

// Re-export for convenience
export { getAllCardDefs };
