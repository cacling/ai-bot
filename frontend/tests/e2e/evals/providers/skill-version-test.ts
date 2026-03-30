/**
 * promptfoo custom provider: skill-versions/test API
 */
const API = process.env.BACKEND_URL ?? 'http://127.0.0.1:18472/api';

export default class SkillVersionTestProvider {
  _id: string;
  constructor() { this._id = 'skill-version-test'; }
  id() { return this._id; }

  async callApi(prompt: string, context: { vars: Record<string, unknown> }) {
    const { skill, version_no, persona, history, session_id, useMock } = context.vars;

    const res = await fetch(`${API}/skill-versions/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill,
        version_no: version_no ?? 1,
        message: prompt,
        persona: persona ?? { phone: '13800000002', name: '李四', status: 'active' },
        ...(history ? { history } : {}),
        ...(session_id ? { session_id } : {}),
        ...(useMock != null ? { useMock } : {}),
      }),
    });

    if (!res.ok) {
      return { output: `[ERROR] HTTP ${res.status}: ${await res.text()}` };
    }

    const body = await res.json() as Record<string, unknown>;
    return { output: String(body.text ?? '') };
  }
}
