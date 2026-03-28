/**
 * useCardPacking.ts — Space-first, priority-aware two-column bin packing
 *
 * Observes card heights via ResizeObserver, re-packs when:
 *  - visible card list changes (new card appears / card removed)
 *  - any card height changes by >50% from last packed snapshot
 *
 * Layout algorithm:
 *  1. Separate visible cards into span-1 and span-2 groups
 *  2. Sort span-1 cards by priority ASC, then greedily assign each to the
 *     shorter column (using real/estimated height) → one merged column segment
 *  3. Sort span-2 cards by priority ASC, append as full-width segments below
 *
 * This maximises space utilisation (all span-1 cards share the same two-column
 * segment) while still respecting priority for vertical ordering.
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

/** Pure function: space-first greedy bin-pack */
function greedyPack(visible: CardState[], heights: Map<string, number>): PackedSegment[] {
  const byPriority = (a: CardState, b: CardState) => cardPriority(a.id) - cardPriority(b.id);

  const span1 = visible.filter(c => getCardDef(c.id)?.colSpan !== 2).sort(byPriority);
  const span2 = visible.filter(c => getCardDef(c.id)?.colSpan === 2).sort(byPriority);

  const segments: PackedSegment[] = [];

  // Pack all span-1 cards into a single two-column segment
  if (span1.length > 0) {
    let lh = 0;
    let rh = 0;
    const left: string[] = [];
    const right: string[] = [];
    for (const c of span1) {
      const h = cardHeight(c.id, heights);
      if (lh <= rh) { left.push(c.id); lh += h; }
      else          { right.push(c.id); rh += h; }
    }
    segments.push({ type: 'columns', left, right });
  }

  // Append span-2 cards as full-width segments below
  for (const c of span2) {
    segments.push({ type: 'full', id: c.id });
  }

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
