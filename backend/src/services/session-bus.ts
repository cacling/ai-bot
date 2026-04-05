/**
 * session-bus.ts — In-memory pub/sub for cross-side session events.
 *
 * Keyed by userPhone so the /ws/chat (customer) and /ws/agent (operator)
 * share the same event channel without needing to exchange session IDs.
 *
 * source: 'user'  → events originating from the customer side
 * source: 'agent' → events originating from the agent workstation side
 *
 * Each side subscribes and filters by the opposite source to avoid echo loops.
 */

/** Every bus event carries a unique msg_id so receivers can deduplicate. */
export type BusEvent =
  | { source: 'user';  type: 'user_message';         text: string;        msg_id: string }
  | { source: 'user';  type: 'text_delta';            delta: string;       msg_id: string }
  | { source: 'user';  type: 'skill_diagram_update';  skill_name: string; mermaid: string; msg_id: string }
  | { source: 'user';  type: 'response';              text: string; card: unknown; skill_diagram: unknown; msg_id: string }
  | { source: 'user';  type: 'transfer_data';         turns: Array<{ role: string; text: string }>; toolRecords: Array<{ tool: string; args: Record<string, unknown>; result_summary: string; success: boolean }>; args: { current_intent?: string; recommended_action?: string }; userMessage: string; msg_id: string }
  | { source: 'agent'; type: 'agent_message';         text: string;        msg_id: string }
  | { source: 'agent'; type: 'text_delta';            delta: string;       msg_id: string }
  | { source: 'agent'; type: 'skill_diagram_update';  skill_name: string; mermaid: string; msg_id: string }
  | { source: 'agent'; type: 'response';              text: string; card: unknown; skill_diagram: unknown; msg_id: string }
  | { source: 'agent'; type: 'transfer_to_bot';       msg_id: string }
  | { source: 'voice'; type: 'user_message';          text: string;        msg_id: string }
  | { source: 'voice'; type: 'response';              text: string;        msg_id: string }
  | { source: 'voice'; type: 'emotion_update';        label: string; emoji: string; color: string; msg_id: string }
  | { source: 'voice'; type: 'skill_diagram_update';  skill_name: string; mermaid: string; progress_state?: string; msg_id: string }
  | { source: 'voice'; type: 'handoff_card';          data: Record<string, unknown>; msg_id: string }
  | { source: 'voice'; type: 'compliance_alert';      data: Record<string, unknown>; msg_id: string }
  | { source: 'system'; type: 'new_session';          channel: string; msg_id: string }
  | { source: 'system'; type: 'reply_hints';         data: Record<string, unknown>; phone: string; msg_id: string }
  | { source: 'system'; type: 'queue_position';      position: number; msg_id: string }
  | { source: 'system'; type: 'agent_joined';        agent_name: string; msg_id: string }
  | { source: 'system'; type: 'agent_welcome';       text: string; msg_id: string }
  | { source: 'system'; type: 'session_closed';      text: string; msg_id: string };

/** Event types stored in per-phone history ring buffer (excludes streaming deltas and internal data). */
const HISTORY_TYPES = new Set(['user_message', 'response', 'agent_message', 'new_session', 'reply_hints', 'agent_joined', 'agent_welcome', 'session_closed']);
const HISTORY_MAX   = 100;

type Subscriber = (event: BusEvent) => void;

class SessionBus {
  private subs     = new Map<string, Set<Subscriber>>();
  private sessions = new Map<string, string>(); // phone → active sessionId
  private history  = new Map<string, BusEvent[]>(); // phone → ring buffer

  subscribe(phone: string, cb: Subscriber): () => void {
    if (!this.subs.has(phone)) this.subs.set(phone, new Set());
    this.subs.get(phone)!.add(cb);
    return () => {
      this.subs.get(phone)?.delete(cb);
      if (this.subs.get(phone)?.size === 0) this.subs.delete(phone);
    };
  }

  /** Subscribe and immediately replay buffered conversation history to the new subscriber. */
  subscribeWithHistory(phone: string, cb: Subscriber): () => void {
    const past = this.history.get(phone) ?? [];
    for (const event of past) {
      try { cb(event); } catch { /* ignore */ }
    }
    return this.subscribe(phone, cb);
  }

  publish(phone: string, event: BusEvent): void {
    // Store in ring buffer if it's a conversational event
    if (HISTORY_TYPES.has(event.type)) {
      const buf = this.history.get(phone) ?? [];
      buf.push(event);
      if (buf.length > HISTORY_MAX) buf.shift();
      this.history.set(phone, buf);
    }
    this.subs.get(phone)?.forEach(cb => {
      try { cb(event); } catch { /* subscriber ws closed */ }
    });
  }

  /** Clear conversation history (e.g. when session resets). */
  clearHistory(phone: string): void {
    this.history.delete(phone);
  }

  setSession(phone: string, sessionId: string): void {
    this.sessions.set(phone, sessionId);
  }

  getSession(phone: string): string | undefined {
    return this.sessions.get(phone);
  }
}

export const sessionBus = new SessionBus();
