/**
 * useCardPacking.ts — Greedy two-column bin packing
 *
 * Observes card heights via ResizeObserver, re-packs when:
 *  - visible card list changes (new card appears / card removed)
 *  - any card height changes by >50% from last packed snapshot
 *
 * colSpan=1 cards are sorted by height desc and greedily assigned
 * to the shorter column. colSpan=2 cards flush the current batch
 * and render full-width.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { getCardDef, type CardDef } from './registry';
import type { CardState } from './registry';

export type PackedSegment =
  | { type: 'columns'; left: string[]; right: string[] }
  | { type: 'full'; id: string };

/** Pure function: greedy bin-pack span-1 cards between span-2 breaks */
function greedyPack(visible: CardState[], heights: Map<string, number>): PackedSegment[] {
  const segments: PackedSegment[] = [];
  let batch: CardState[] = [];

  const flushBatch = () => {
    if (batch.length === 0) return;
    const sorted = [...batch].sort((a, b) =>
      (heights.get(b.id) ?? 100) - (heights.get(a.id) ?? 100),
    );
    let lh = 0;
    let rh = 0;
    const left: string[] = [];
    const right: string[] = [];
    for (const c of sorted) {
      const def = getCardDef(c.id) as CardDef | undefined;
      const h = heights.get(c.id) ?? def?.defaultHeight ?? 100;
      if (lh <= rh) { left.push(c.id); lh += h; }
      else           { right.push(c.id); rh += h; }
    }
    segments.push({ type: 'columns', left, right });
    batch = [];
  };

  for (const card of visible) {
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
