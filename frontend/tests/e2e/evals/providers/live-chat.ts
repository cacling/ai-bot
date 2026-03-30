/**
 * promptfoo custom provider: live chat API
 *
 * Calls POST /api/chat for testing intent recognition.
 * Export a class as default — promptfoo instantiates it with `new`.
 */
const API = process.env.BACKEND_URL ?? 'http://127.0.0.1:18472/api';

export default class LiveChatProvider {
  _id: string;

  constructor() {
    this._id = 'live-chat';
  }

  id() {
    return this._id;
  }

  async callApi(prompt: string, context: { vars: Record<string, unknown> }) {
    const { user_phone, session_id } = context.vars;
    const sid = (session_id as string) ?? `eval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sid,
        message: prompt,
        user_phone: user_phone ?? '13800000002',
      }),
    });

    if (!res.ok) {
      return { output: `[ERROR] HTTP ${res.status}: ${await res.text()}` };
    }

    const body = await res.json() as Record<string, unknown>;
    return {
      output: String(body.response ?? body.text ?? ''),
    };
  }
}
