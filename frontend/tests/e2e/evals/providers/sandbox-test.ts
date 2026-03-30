/**
 * promptfoo custom provider: sandbox mock test API
 *
 * Lifecycle: create sandbox → run test (mock mode) → cleanup sandbox
 * Returns the LLM response text for assertion.
 *
 * vars:
 *   skill: string        — skill name (e.g., "bill-inquiry")
 *   useMock?: boolean     — default true
 */
const API = process.env.BACKEND_URL ?? 'http://127.0.0.1:18472/api';

export default class SandboxTestProvider {
  _id: string;

  constructor() {
    this._id = 'sandbox-test';
  }

  id() {
    return this._id;
  }

  async callApi(prompt: string, context: { vars: Record<string, unknown> }) {
    const skill = context.vars.skill as string;
    const useMock = (context.vars.useMock as boolean) ?? true;
    let sandboxId: string | null = null;

    try {
      // Create sandbox
      const createRes = await fetch(`${API}/sandbox/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_path: `skills/biz-skills/${skill}/SKILL.md` }),
      });
      if (!createRes.ok) {
        return { output: `[ERROR] sandbox create failed: HTTP ${createRes.status}` };
      }
      const createBody = await createRes.json() as Record<string, unknown>;
      sandboxId = createBody.sandbox_id as string;

      // Run test
      const testRes = await fetch(`${API}/sandbox/${sandboxId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, useMock }),
      });
      if (!testRes.ok) {
        return { output: `[ERROR] sandbox test failed: HTTP ${testRes.status}` };
      }
      const result = await testRes.json() as Record<string, unknown>;
      return {
        output: String(result.text ?? ''),
      };
    } catch (err) {
      return { output: `[ERROR] ${String(err)}` };
    } finally {
      // Cleanup
      if (sandboxId) {
        try {
          await fetch(`${API}/sandbox/${sandboxId}`, { method: 'DELETE' });
        } catch { /* ignore cleanup errors */ }
      }
    }
  }
}
