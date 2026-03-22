/**
 * CardPanel.tsx — right-panel card container
 *
 * Layout: 2-column CSS grid.
 * - colSpan:2 cards span full width (e.g. diagram)
 * - colSpan:1 cards occupy one column (e.g. emotion, handoff)
 *
 * Drag-to-reorder: swaps order values when a card is dropped onto another.
 *
 * Wrapped with React.memo + useMemo for sorted/visible arrays to avoid
 * unnecessary re-renders of unchanged cards.
 */

import { memo, useState, useMemo, useCallback } from 'react';
import { CardShell } from './CardShell';
import { getCardDef, getAllCardDefs, type CardState } from './registry';
import type { Lang } from '../../i18n';

interface Props {
  cards: CardState[];
  lang: Lang;
  onUpdate: (cards: CardState[]) => void;
}

export const CardPanel = memo(function CardPanel({ cards, lang, onUpdate }: Props) {
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dragOverId,  setDragOverId]  = useState<string | null>(null);

  const sorted  = useMemo(() => [...cards].sort((a, b) => a.order - b.order), [cards]);
  const visible = useMemo(() => sorted.filter(s => s.isOpen), [sorted]);
  const closed  = useMemo(() => sorted.filter(s => !s.isOpen), [sorted]);

  const handleDragStart = useCallback((id: string) => (e: React.DragEvent) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (id !== draggingId) setDragOverId(id);
  }, [draggingId]);

  const resetDrag = useCallback(() => { setDraggingId(null); setDragOverId(null); }, []);

  const handleDrop = useCallback((targetId: string) => (e: React.DragEvent) => {
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
  }, [draggingId, cards, onUpdate, resetDrag]);

  const toggleCollapse = useCallback((id: string) => {
    onUpdate(cards.map(c => c.id === id ? { ...c, isCollapsed: !c.isCollapsed } : c));
  }, [cards, onUpdate]);

  const closeCard = useCallback((id: string) => {
    onUpdate(cards.map(c => c.id === id ? { ...c, isOpen: false } : c));
  }, [cards, onUpdate]);

  const reopenCard = useCallback((id: string) => {
    onUpdate(cards.map(c => c.id === id ? { ...c, isOpen: true } : c));
  }, [cards, onUpdate]);

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* 2-column grid for open cards; dense flow fills gaps when col-span-2 items interrupt col-span-1 pairs */}
      <div className="columns-2 gap-3">
        {visible.map(state => {
          const def = getCardDef(state.id);
          if (!def) return null;
          return (
            <div
              key={state.id}
              className={`break-inside-avoid mb-3${def.colSpan === 2 ? ' [column-span:all]' : ''}`}
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
                onClick={() => reopenCard(state.id)}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-background border border-border shadow-sm text-[11px] text-muted-foreground hover:text-foreground hover:border-border transition"
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
        <div className="text-center text-xs text-muted-foreground py-8">暂无卡片</div>
      )}
    </div>
  );
});

// Re-export for convenience
export { getAllCardDefs };
