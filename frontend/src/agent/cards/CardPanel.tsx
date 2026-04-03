/**
 * CardPanel.tsx — right-panel card container
 *
 * Layout: greedy two-column bin packing via useCardPacking.
 * - colSpan:1 cards are packed into left/right columns to minimise height diff
 * - colSpan:2 cards span full width between column segments
 * - Re-packs automatically when a card's height changes >50% or cards appear/hide
 *
 * Drag-to-reorder: swaps order values when a card is dropped onto another.
 */

import { memo, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { CardShell } from './CardShell';
import { getCardDef, getAllCardDefs, type CardState } from './registry';
import { useCardPacking } from './useCardPacking';
import { getQueueLayout, applyQueueLayout } from './queue-layouts';
import type { Lang } from '../../i18n';

interface Props {
  cards: CardState[];
  lang: Lang;
  /** Current queue code of focused interaction. Used to deprioritize irrelevant cards. */
  queueCode?: string | null;
  onUpdate: (cards: CardState[]) => void;
}

export const CardPanel = memo(function CardPanel({ cards, lang, queueCode, onUpdate }: Props) {
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dragOverId,  setDragOverId]  = useState<string | null>(null);
  // Track whether user has manually adjusted cards for this queue
  const userAdjustedRef = useRef(false);
  const appliedQueueRef = useRef<string | null>(null);

  // Auto-apply queue layout when queueCode changes
  useEffect(() => {
    if (queueCode === appliedQueueRef.current) return;
    appliedQueueRef.current = queueCode ?? null;
    userAdjustedRef.current = false; // Reset on queue change

    const layout = getQueueLayout(queueCode);
    if (!layout) return;

    const updated = applyQueueLayout(cards, layout);
    onUpdate(updated);
  }, [queueCode]); // intentionally exclude cards/onUpdate to avoid loops

  // Sort cards by order, then deprioritize cards irrelevant to current queue
  const sorted = useMemo(() => {
    const sorted = [...cards].sort((a, b) => a.order - b.order);
    if (!queueCode) return sorted;
    return sorted.sort((a, b) => {
      const defA = getCardDef(a.id);
      const defB = getCardDef(b.id);
      const relevantA = !defA?.relevantQueues || defA.relevantQueues.includes(queueCode);
      const relevantB = !defB?.relevantQueues || defB.relevantQueues.includes(queueCode);
      if (relevantA && !relevantB) return -1;
      if (!relevantA && relevantB) return 1;
      return a.order - b.order;
    });
  }, [cards, queueCode]);

  const visible = useMemo(() => sorted.filter(s => s.isOpen), [sorted]);
  const closed  = useMemo(() => sorted.filter(s => !s.isOpen), [sorted]);

  const { containerRef, segments } = useCardPacking(visible);

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
    userAdjustedRef.current = true;
    onUpdate(cards.map(c => c.id === id ? { ...c, isCollapsed: !c.isCollapsed } : c));
  }, [cards, onUpdate]);

  const closeCard = useCallback((id: string) => {
    userAdjustedRef.current = true;
    onUpdate(cards.map(c => c.id === id ? { ...c, isOpen: false } : c));
  }, [cards, onUpdate]);

  const reopenCard = useCallback((id: string) => {
    userAdjustedRef.current = true;
    onUpdate(cards.map(c => c.id === id ? { ...c, isOpen: true } : c));
  }, [cards, onUpdate]);

  const renderCard = useCallback((id: string) => {
    const state = cards.find(c => c.id === id);
    const def = getCardDef(id);
    if (!state || !def) return null;
    return (
      <div key={id} data-card-id={id} className="mb-3">
        <CardShell
          def={def}
          state={state}
          lang={lang}
          onToggleCollapse={() => toggleCollapse(id)}
          onClose={() => closeCard(id)}
          onDragStart={handleDragStart(id)}
          onDragOver={handleDragOver(id)}
          onDrop={handleDrop(id)}
          isDragging={draggingId === id}
          isDragOver={dragOverId === id}
        />
      </div>
    );
  }, [cards, lang, draggingId, dragOverId, toggleCollapse, closeCard, handleDragStart, handleDragOver, handleDrop]);

  return (
    <div className="flex flex-col gap-2 w-full">
      <div ref={containerRef}>
        {segments.map((seg, i) => {
          if (seg.type === 'full') {
            return renderCard(seg.id);
          }
          return (
            <div key={`seg-${i}`} className="flex gap-3 items-start">
              <div className="flex-1 flex flex-col">{seg.left.map(id => renderCard(id))}</div>
              <div className="flex-1 flex flex-col">{seg.right.map(id => renderCard(id))}</div>
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
