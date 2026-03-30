/**
 * promptfoo custom provider: multi-turn chat API
 *
 * Sends multiple turns sequentially to POST /api/chat with the same session_id.
 * Returns all responses joined by "\n---TURN---\n" for assertion on the full conversation.
 *
 * vars:
 *   turns: Array<{ message: string }>  — messages to send in order
 *   user_phone?: string                — default "13800000001"
 *
 * The `prompt` parameter (from promptfoo's "{{message}}") is ignored;
 * use vars.turns instead.
 */
const API = process.env.BACKEND_URL ?? 'http://127.0.0.1:18472/api';

const TURN_SEPARATOR = '\n---TURN---\n';

export default class MultiTurnChatProvider {
  _id: string;

  constructor() {
    this._id = 'multi-turn-chat';
  }

  id() {
    return this._id;
  }

  async callApi(_prompt: string, context: { vars: Record<string, unknown> }) {
    const turns = context.vars.turns as Array<{ message: string }> | undefined;
    if (!turns || !Array.isArray(turns) || turns.length === 0) {
      return { output: '[ERROR] vars.turns must be a non-empty array of {message}' };
    }

    const userPhone = (context.vars.user_phone as string) ?? '13800000001';
    const sessionId = `eval-mt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const replies: string[] = [];

    for (const turn of turns) {
      try {
        const res = await fetch(`${API}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            message: turn.message,
            user_phone: userPhone,
          }),
        });

        if (!res.ok) {
          replies.push(`[ERROR] HTTP ${res.status}: ${await res.text()}`);
          break;
        }

        const body = await res.json() as Record<string, unknown>;
        const reply = String(body.response ?? body.text ?? '');
        replies.push(reply);
      } catch (err) {
        replies.push(`[ERROR] ${String(err)}`);
        break;
      }
    }

    return {
      output: replies.join(TURN_SEPARATOR),
    };
  }
}
