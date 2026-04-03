/**
 * cards/registry.ts
 *
 * Central registry for agent-workstation card definitions.
 * Usage:
 *   registerCard(def)        — register a card (call at module init)
 *   getCardDef(id)           — get static def by id
 *   findCardByEvent(type)    — find def that handles this WS event type
 *   getAllCardDefs()          — all registered defs in registration order
 *   buildInitialCardStates() — initial runtime state array
 */

import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Lang } from '../../i18n';

export interface CardDef {
  id: string;
  title: Record<Lang, string>;
  Icon: LucideIcon;
  headerClass: string;   // Tailwind gradient classes for the card header
  colSpan: 1 | 2;       // how many columns in the 2-col grid
  priority: number;     // 1 (highest) – 10 (lowest): higher-priority cards are placed higher
  defaultHeight: number; // estimated initial height (px) before ResizeObserver measures
  defaultOpen: boolean;
  defaultCollapsed: boolean;
  wsEvents: string[];    // WS message types this card handles
  dataExtractor: (msg: Record<string, unknown>) => unknown;
  component: ComponentType<{ data: unknown; lang: Lang }>;
  /** Queue codes where this card is relevant. null = relevant everywhere. */
  relevantQueues?: string[] | null;
}

export interface CardState {
  id: string;
  order: number;
  isOpen: boolean;
  isCollapsed: boolean;
  data: unknown;
}

const registry = new Map<string, CardDef>();

export function registerCard(def: CardDef): void {
  registry.set(def.id, def);
}

export function getCardDef(id: string): CardDef | undefined {
  return registry.get(id);
}

export function findCardByEvent(eventType: string): CardDef | undefined {
  for (const def of registry.values()) {
    if (def.wsEvents.includes(eventType)) return def;
  }
  return undefined;
}

export function getAllCardDefs(): CardDef[] {
  return Array.from(registry.values());
}

export function buildInitialCardStates(): CardState[] {
  return Array.from(registry.values()).map((def, index) => ({
    id: def.id,
    order: index,
    isOpen: def.defaultOpen,
    isCollapsed: def.defaultCollapsed,
    data: null,
  }));
}
