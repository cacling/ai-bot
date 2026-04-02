/**
 * interaction-bus.ts — Interaction-keyed pub/sub abstraction layer.
 *
 * Phase 2: Full implementation with Map<interaction_id, Set<Subscriber>>
 *          and bidirectional bridge to sessionBus for backward compatibility.
 *
 * Supports both:
 *   - interaction-keyed: publishToInteraction / subscribeToInteraction
 *   - phone-keyed (legacy): publishByPhone / subscribeByPhone
 *
 * Bridge: interaction → phone mapping allows interaction events to also
 * reach phone-based subscribers (old agent-ws), and phone events to reach
 * interaction-based subscribers (new workspace-ws).
 */
import { type BusEvent, sessionBus } from './session-bus';
import { logger } from './logger';

// ── Types ──────────────────────────────────────────────────────────────────

/** Extended event carrying optional interaction/conversation context. */
export type InteractionBusEvent = BusEvent & {
  interaction_id?: string;
  conversation_id?: string;
};

type Subscriber = (event: InteractionBusEvent) => void;

// ── InteractionBus ─────────────────────────────────────────────────────────

class InteractionBus {
  /** Direct interaction-keyed subscribers. */
  private interactionSubs = new Map<string, Set<Subscriber>>();

  /** Interaction → phone bridge mapping (for backward compatibility). */
  private interactionToPhone = new Map<string, string>();

  /** Phone → interaction reverse mapping (for phone→interaction bridging). */
  private phoneToInteractions = new Map<string, Set<string>>();

  /** Per-interaction event history (ring buffer, max 100). */
  private history = new Map<string, InteractionBusEvent[]>();
  private static MAX_HISTORY = 100;

  // ── Bridge registration ────────────────────────────────────────────────

  /** Register bidirectional mapping between interaction and phone. */
  registerInteractionPhone(interactionId: string, phone: string): void {
    this.interactionToPhone.set(interactionId, phone);
    if (!this.phoneToInteractions.has(phone)) {
      this.phoneToInteractions.set(phone, new Set());
    }
    this.phoneToInteractions.get(phone)!.add(interactionId);
    logger.info('interaction-bus', 'bridge_registered', { interactionId, phone });
  }

  /** Remove bridge mapping for an interaction. */
  unregisterInteractionPhone(interactionId: string): void {
    const phone = this.interactionToPhone.get(interactionId);
    if (phone) {
      this.phoneToInteractions.get(phone)?.delete(interactionId);
      if (this.phoneToInteractions.get(phone)?.size === 0) {
        this.phoneToInteractions.delete(phone);
      }
    }
    this.interactionToPhone.delete(interactionId);
  }

  /** Look up the phone for a given interaction. */
  getPhoneByInteraction(interactionId: string): string | undefined {
    return this.interactionToPhone.get(interactionId);
  }

  /** Look up interactions for a given phone. */
  getInteractionsByPhone(phone: string): Set<string> | undefined {
    return this.phoneToInteractions.get(phone);
  }

  // ── Interaction-keyed API ──────────────────────────────────────────────

  /**
   * Publish an event to all subscribers of a given interaction.
   * Also bridges to sessionBus (phone-keyed) for backward compatibility.
   */
  publishToInteraction(interactionId: string, event: InteractionBusEvent): void {
    // Enrich event with interaction context
    const enriched = { ...event, interaction_id: interactionId };

    // Direct interaction subscribers
    const subs = this.interactionSubs.get(interactionId);
    if (subs) {
      for (const cb of subs) {
        try { cb(enriched); } catch { /* subscriber error */ }
      }
    }

    // Store in history
    this.appendHistory(interactionId, enriched);

    // Bridge to phone-keyed sessionBus
    const phone = this.interactionToPhone.get(interactionId);
    if (phone) {
      sessionBus.publish(phone, event);
    }
  }

  /**
   * Subscribe to events for a given interaction.
   * Returns unsubscribe function.
   */
  subscribeToInteraction(interactionId: string, cb: Subscriber): () => void {
    if (!this.interactionSubs.has(interactionId)) {
      this.interactionSubs.set(interactionId, new Set());
    }
    this.interactionSubs.get(interactionId)!.add(cb);

    return () => {
      const subs = this.interactionSubs.get(interactionId);
      if (subs) {
        subs.delete(cb);
        if (subs.size === 0) this.interactionSubs.delete(interactionId);
      }
    };
  }

  /**
   * Subscribe to an interaction with history replay.
   * Replays buffered events first, then subscribes to live events.
   */
  subscribeToInteractionWithHistory(interactionId: string, cb: Subscriber): () => void {
    const hist = this.history.get(interactionId);
    if (hist) {
      for (const event of hist) {
        try { cb(event); } catch { /* subscriber error */ }
      }
    }
    return this.subscribeToInteraction(interactionId, cb);
  }

  /**
   * Forward a phone-bus event to all interactions associated with that phone.
   * Called from sessionBus bridge to propagate customer messages to interaction subscribers.
   */
  bridgeFromPhone(phone: string, event: BusEvent): void {
    const interactionIds = this.phoneToInteractions.get(phone);
    if (!interactionIds) return;
    for (const interactionId of interactionIds) {
      const enriched: InteractionBusEvent = { ...event, interaction_id: interactionId };
      const subs = this.interactionSubs.get(interactionId);
      if (subs) {
        for (const cb of subs) {
          try { cb(enriched); } catch { /* subscriber error */ }
        }
      }
      this.appendHistory(interactionId, enriched);
    }
  }

  // ── Phone-keyed API (backward-compatible wrappers) ────────────────────

  /** Publish by phone — delegates directly to sessionBus. */
  publishByPhone(phone: string, event: BusEvent): void {
    sessionBus.publish(phone, event);
  }

  /** Subscribe by phone — delegates directly to sessionBus. */
  subscribeByPhone(phone: string, cb: (event: BusEvent) => void): () => void {
    return sessionBus.subscribe(phone, cb);
  }

  /** Subscribe with history replay by phone — delegates directly to sessionBus. */
  subscribeByPhoneWithHistory(phone: string, cb: (event: BusEvent) => void): () => void {
    return sessionBus.subscribeWithHistory(phone, cb);
  }

  // ── History ────────────────────────────────────────────────────────────

  private appendHistory(interactionId: string, event: InteractionBusEvent): void {
    if (!this.history.has(interactionId)) {
      this.history.set(interactionId, []);
    }
    const buf = this.history.get(interactionId)!;
    buf.push(event);
    if (buf.length > InteractionBus.MAX_HISTORY) {
      buf.shift();
    }
  }

  /** Get event history for an interaction. */
  getHistory(interactionId: string): InteractionBusEvent[] {
    return this.history.get(interactionId) ?? [];
  }

  /** Clear history for an interaction. */
  clearHistory(interactionId: string): void {
    this.history.delete(interactionId);
  }
}

export const interactionBus = new InteractionBus();
