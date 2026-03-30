/**
 * promptfoo custom provider: skill-creator/chat API
 */
const API = process.env.BACKEND_URL ?? 'http://127.0.0.1:18472/api';

export default class SkillCreatorChatProvider {
  _id: string;
  constructor() { this._id = 'skill-creator-chat'; }
  id() { return this._id; }

  async callApi(prompt: string, context: { vars: Record<string, unknown> }) {
    const { session_id, enable_thinking, image } = context.vars;

    const res = await fetch(`${API}/skill-creator/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        session_id: session_id ?? null,
        enable_thinking: enable_thinking ?? false,
        ...(image ? { image } : {}),
      }),
    });

    if (!res.ok) {
      return { output: `[ERROR] HTTP ${res.status}: ${await res.text()}` };
    }

    const body = await res.json() as Record<string, unknown>;
    return { output: String(body.reply ?? '') };
  }
}
