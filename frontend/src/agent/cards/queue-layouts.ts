/**
 * queue-layouts.ts — Per-queue default card configurations.
 *
 * Defines which cards should be open, collapsed, or closed
 * when an agent enters a conversation from a specific queue.
 *
 * The agent can manually adjust cards; once they do, the auto-layout
 * stops overriding for that interaction.
 */

import { getCardDef } from './registry';

export interface QueueCardLayout {
  /** Cards that should be open and expanded */
  open: string[];
  /** Cards that should be open but collapsed */
  collapsed: string[];
  /** Cards that should be hidden (closed) */
  closed: string[];
}

/**
 * Queue code → card layout mapping.
 *
 * Cards not mentioned in any list retain their registry defaults.
 * Prefix matching is supported: "fault_chat_vip" will match "fault_chat".
 */
export const QUEUE_LAYOUTS: Record<string, QueueCardLayout> = {
  fault_chat: {
    open: ['handoff', 'work_order_summary', 'agent_copilot', 'route_context'],
    collapsed: ['user_detail', 'emotion'],
    closed: ['outbound_task', 'engagement_context'],
  },
  cancel_chat: {
    open: ['handoff', 'compliance', 'agent_copilot'],
    collapsed: ['user_detail', 'work_order_summary'],
    closed: ['outbound_task', 'engagement_context', 'diagram'],
  },
  bill_chat: {
    open: ['handoff', 'agent_copilot', 'work_order_summary'],
    collapsed: ['user_detail', 'compliance'],
    closed: ['outbound_task', 'engagement_context'],
  },
  outbound: {
    open: ['outbound_task', 'user_detail', 'agent_copilot'],
    collapsed: ['work_order_summary'],
    closed: ['engagement_context', 'route_context'],
  },
  engagement: {
    open: ['engagement_context', 'agent_copilot', 'handoff'],
    collapsed: ['user_detail'],
    closed: ['outbound_task', 'work_order_summary'],
  },
};

/**
 * Resolve layout for a queue code.
 * Tries exact match first, then prefix match.
 * Returns null if no layout is configured.
 */
export function getQueueLayout(queueCode: string | null | undefined): QueueCardLayout | null {
  if (!queueCode) return null;

  // Exact match
  if (QUEUE_LAYOUTS[queueCode]) return QUEUE_LAYOUTS[queueCode];

  // Prefix match
  for (const key of Object.keys(QUEUE_LAYOUTS)) {
    if (queueCode.startsWith(key)) return QUEUE_LAYOUTS[key];
  }

  return null;
}

/**
 * Apply a queue layout to existing card states.
 * Returns updated card states array or null if no changes needed.
 */
export function applyQueueLayout(
  cards: { id: string; isOpen: boolean; isCollapsed: boolean; order: number; data: unknown }[],
  layout: QueueCardLayout,
): typeof cards {
  const openSet = new Set(layout.open);
  const collapsedSet = new Set(layout.collapsed);
  const closedSet = new Set(layout.closed);

  return cards.map((card) => {
    const def = getCardDef(card.id);
    const dataOnly = def?.showOnDataOnly && card.data == null;

    if (openSet.has(card.id)) {
      // Don't force-open a showOnDataOnly card that has no data yet
      if (dataOnly) return { ...card, isOpen: false, isCollapsed: false };
      return { ...card, isOpen: true, isCollapsed: false };
    }
    if (collapsedSet.has(card.id)) {
      if (dataOnly) return { ...card, isOpen: false, isCollapsed: true };
      return { ...card, isOpen: true, isCollapsed: true };
    }
    if (closedSet.has(card.id)) {
      return { ...card, isOpen: false };
    }
    // Unlisted cards keep their defaults
    return card;
  });
}
