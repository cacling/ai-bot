/**
 * useCardPacking.ts — Priority-aware greedy two-column bin packing
 *
 * Observes card heights via ResizeObserver, re-packs when:
 *  - visible card list changes (new card appears / card removed)
 *  - any card height changes by >50% from last packed snapshot
 *
 * Layout algorithm (Scheme C):
 *  1. Sort all visible cards by priority ASC (1 = highest)
 *  2. colSpan=2 cards flush the current span-1 batch and render full-width
 *  3. Within each batch, cards are processed in priority order and greedily
 *     assigned to the shorter column (using real/estimated height for balance)
 *  4. Column order naturally follows priority (processed first → placed first)
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { getCardDef, type CardDef } from './registry';
import type { CardState } from './registry';

export type PackedSegment =
  | { type: 'columns'; left: string[]; right: string[] }
  | { type: 'full'; id: string };

function cardHeight(id: string, heights: Map<string, number>): number {
  return heights.get(id) ?? (getCardDef(id) as CardDef | undefined)?.defaultHeight ?? 100;
}

function cardPriority(id: string): number {
  return (getCardDef(id) as CardDef | undefined)?.priority ?? 5;
}

/** Pure function: priority-aware greedy bin-pack span-1 cards between span-2 breaks */
function greedyPack(visible: CardState[], heights: Map<string, number>): PackedSegment[] {
  // Sort all visible cards by priority ASC before segmenting
  const sorted = [...visible].sort((a, b) => cardPriority(a.id) - cardPriority(b.id));

  const segments: PackedSegment[] = [];
  let batch: CardState[] = [];

  const flushBatch = () => {
    if (batch.length === 0) return;
    // batch is already in priority order (inherited from sorted input)
    let lh = 0;
    let rh = 0;
    const left: string[] = [];
    const right: string[] = [];
    for (const c of batch) {
      const h = cardHeight(c.id, heights);
      if (lh <= rh) { left.push(c.id); lh += h; }
      else          { right.push(c.id); rh += h; }
    }
    segments.push({ type: 'columns', left, right });
    batch = [];
  };

  for (const card of sorted) {
    const def = getCardDef(card.id);
    if (!def) continue;
    if (def.colSpan === 2) {
      flushBatch();
      segments.push({ type: 'full', id: card.id });
    } else {
      batch.push(card);
    }
  }
  flushBatch();
  return segments;
}

export function useCardPacking(visible: CardState[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const heightMap = useRef(new Map<string, number>());
  const packedHeightMap = useRef(new Map<string, number>());
  const [segments, setSegments] = useState<PackedSegment[]>([]);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const repack = useCallback(() => {
    setSegments(greedyPack(visibleRef.current, heightMap.current));
    packedHeightMap.current = new Map(heightMap.current);
  }, []);

  // Repack whenever the visible card list changes
  const visibleKey = visible.map(v => v.id).join(',');
  useEffect(() => { repack(); }, [visibleKey, repack]);

  // Single long-lived ResizeObserver
  const roRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    roRef.current = new ResizeObserver(entries => {
      let trigger = false;
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.cardId;
        if (!id) continue;
        const h = entry.contentRect.height;
        heightMap.current.set(id, h);
        const prev = packedHeightMap.current.get(id);
        // Trigger on first measurement (prev unknown) or >50% change
        if (prev == null || (prev > 0 && Math.abs(h - prev) / prev > 0.5)) {
          trigger = true;
        }
      }
      if (trigger) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => repack());
      }
    });
    return () => {
      roRef.current?.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [repack]);

  // Re-sync observed elements after each render (DOM may have changed)
  useEffect(() => {
    const ro = roRef.current;
    const el = containerRef.current;
    if (!ro || !el) return;
    ro.disconnect();
    el.querySelectorAll<HTMLElement>('[data-card-id]').forEach(n => ro.observe(n));
  });

  return { containerRef, segments };
}
