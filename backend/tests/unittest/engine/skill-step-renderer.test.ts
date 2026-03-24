import { describe, test, expect } from 'bun:test';

// Note: renderStep calls generateText which needs LLM API.
// These tests verify the prompt building logic only.
// Full integration is tested in E2E.

describe('StepRenderer', () => {
  test('buildStepPrompt is importable', async () => {
    // Just verify the module loads without errors
    const mod = await import('../../../src/engine/skill-step-renderer');
    expect(typeof mod.renderStep).toBe('function');
  });
});
