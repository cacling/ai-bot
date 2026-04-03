/**
 * useRouteExplanation.ts — Extracts routing context for an interaction.
 *
 * Fetches interaction events once per interaction and derives:
 * - routing mode (direct_assign / push_offer / pull_claim)
 * - transfer source queue (if transferred)
 * - overflow flag + reason
 * - intent code (from handoff_summary [intent:XXX])
 *
 * Results are cached per interaction_id.
 */
import { useState, useEffect, useRef } from 'react';

const IX_API_BASE = '/ix-api';

interface RouteEvent {
  event_type: string;
  actor_type?: string;
  actor_id?: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface RouteExplanation {
  routingMode: string | null;
  fromQueue: string | null;
  isOverflow: boolean;
  overflowReason: string | null;
  transferSource: string | null;
  intentCode: string | null;
}

const EMPTY: RouteExplanation = {
  routingMode: null,
  fromQueue: null,
  isOverflow: false,
  overflowReason: null,
  transferSource: null,
  intentCode: null,
};

/** Parse [intent:XXX] from handoff_summary */
function parseIntent(summary: string | null | undefined): string | null {
  if (!summary) return null;
  const m = summary.match(/\[intent:([^\]]+)\]/);
  return m ? m[1] : null;
}

function deriveExplanation(events: RouteEvent[], handoffSummary?: string | null): RouteExplanation {
  const result: RouteExplanation = { ...EMPTY };

  // Find the most recent assigned event for routing mode
  const assignedEvent = [...events].reverse().find((e) => e.event_type === 'assigned');
  if (assignedEvent?.payload) {
    result.routingMode = (assignedEvent.payload.routing_mode as string) ?? null;
    result.fromQueue = (assignedEvent.payload.from_queue as string) ?? null;
  }

  // Find the most recent transferred event
  const transferEvent = [...events].reverse().find((e) => e.event_type === 'transferred');
  if (transferEvent?.payload) {
    result.transferSource = (transferEvent.payload.from_queue as string) ?? (transferEvent.payload.source_queue as string) ?? null;
    if (!result.fromQueue && result.transferSource) {
      result.fromQueue = result.transferSource;
    }
  }

  // Find overflow event
  const overflowEvent = [...events].reverse().find((e) => e.event_type === 'overflow');
  if (overflowEvent) {
    result.isOverflow = true;
    result.overflowReason = (overflowEvent.payload?.reason as string) ?? null;
    if (!result.fromQueue && overflowEvent.payload?.from_queue) {
      result.fromQueue = overflowEvent.payload.from_queue as string;
    }
  }

  // Parse intent from handoff summary
  result.intentCode = parseIntent(handoffSummary);

  return result;
}

/** Cache to avoid re-fetching events for the same interaction */
const cache = new Map<string, RouteExplanation>();

export function useRouteExplanation(
  interactionId: string | null | undefined,
  handoffSummary?: string | null,
): RouteExplanation | null {
  const [explanation, setExplanation] = useState<RouteExplanation | null>(() => {
    if (!interactionId) return null;
    return cache.get(interactionId) ?? null;
  });
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!interactionId) {
      setExplanation(null);
      return;
    }

    // Use cache if available
    const cached = cache.get(interactionId);
    if (cached) {
      setExplanation(cached);
      return;
    }

    // Avoid duplicate fetches
    if (fetchedRef.current === interactionId) return;
    fetchedRef.current = interactionId;

    fetch(`${IX_API_BASE}/api/interactions/${interactionId}/events`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const events: RouteEvent[] = data.items ?? data ?? [];
        const result = deriveExplanation(events, handoffSummary);
        cache.set(interactionId, result);
        setExplanation(result);
      })
      .catch(() => {
        // On error, set empty explanation so UI doesn't stay loading
        setExplanation(EMPTY);
      });
  }, [interactionId, handoffSummary]);

  return explanation;
}
