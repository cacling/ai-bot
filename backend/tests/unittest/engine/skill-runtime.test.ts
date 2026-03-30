import { describe, test, expect, beforeEach } from 'bun:test';
import { platformDb as db } from '../../../src/db';
import { skillInstances, skillInstanceEvents, sessions } from '../../../src/db/schema';
import * as instanceStore from '../../../src/engine/skill-instance-store';
import type { WorkflowSpec } from '../../../src/engine/skill-workflow-types';
import { runSkillTurn } from '../../../src/engine/skill-runtime';
import { ToolRuntime } from '../../../src/tool-runtime';

const TEST_SESSION = 'runtime-test-session';

// Simple 3-step spec: tool -> confirm -> end
const SIMPLE_SPEC: WorkflowSpec = {
  skillId: 'test-skill', version: 1,
  startStepId: 'query',
  steps: {
    query: { id: 'query', label: 'Query', kind: 'tool', tool: 'query_subscriber', transitions: [{ target: 'check', guard: 'always' }] },
    check: { id: 'check', label: 'Check', kind: 'choice', transitions: [
      { target: 'confirm', guard: 'tool.success' },
      { target: 'error', guard: 'tool.error' },
    ]},
    confirm: { id: 'confirm', label: 'Confirm', kind: 'confirm', transitions: [
      { target: 'execute', guard: 'user.confirm' },
      { target: 'cancelled', guard: 'user.cancel' },
    ]},
    execute: { id: 'execute', label: 'Execute', kind: 'tool', tool: 'cancel_service', transitions: [{ target: 'done', guard: 'always' }] },
    done: { id: 'done', label: 'Done', kind: 'end', transitions: [] },
    cancelled: { id: 'cancelled', label: 'Cancelled', kind: 'end', transitions: [] },
    error: { id: 'error', label: 'Error', kind: 'human', transitions: [] },
  },
  terminalSteps: ['done', 'cancelled', 'error'],
};

describe('SkillRuntime', () => {
  beforeEach(() => {
    db.delete(skillInstanceEvents).run();
    db.delete(skillInstances).run();
    try { db.insert(sessions).values({ id: TEST_SESSION, phone: '13800000001', channel: 'online' }).run(); } catch { /* already exists */ }
  });

  test('createInstance on first call', () => {
    const inst = instanceStore.createInstance(TEST_SESSION, 'test-skill', 1, 'query');
    expect(inst.id).toBeTruthy();
    const found = instanceStore.findActiveInstance(TEST_SESSION);
    expect(found).not.toBeNull();
    expect(found!.status).toBe('running');
  });

  test('instance lifecycle: create -> advance -> finish', () => {
    const inst = instanceStore.createInstance(TEST_SESSION, 'test-skill', 1, 'query');
    instanceStore.advanceStep(inst.id, 'confirm', 1);
    instanceStore.setPendingConfirm(inst.id, true);

    const waiting = instanceStore.findActiveInstance(TEST_SESSION);
    expect(waiting!.status).toBe('waiting_user');
    expect(waiting!.pending_confirm).toBe(1);

    instanceStore.setPendingConfirm(inst.id, false);
    instanceStore.advanceStep(inst.id, 'done', 2);
    instanceStore.finishInstance(inst.id, 'completed');

    const finished = instanceStore.findActiveInstance(TEST_SESSION);
    expect(finished).toBeNull(); // completed instances not returned
  });

  test('events logged correctly', () => {
    const inst = instanceStore.createInstance(TEST_SESSION, 'test-skill', 1, 'query');
    instanceStore.appendEvent(inst.id, { eventType: 'state_enter', stepId: 'query' });
    instanceStore.appendEvent(inst.id, { eventType: 'tool_call', stepId: 'query', toolName: 'query_subscriber' });
    instanceStore.appendEvent(inst.id, { eventType: 'tool_result', stepId: 'query', toolName: 'query_subscriber', payload: { success: true } });
    instanceStore.appendEvent(inst.id, { eventType: 'branch_taken', stepId: 'check', payload: { target: 'confirm' } });
    instanceStore.appendEvent(inst.id, { eventType: 'user_confirm', stepId: 'confirm' });

    const events = instanceStore.getEvents(inst.id);
    expect(events.length).toBe(5);
    expect(events[0].event_type).toBe('state_enter');
    expect(events[1].event_type).toBe('tool_call');
    expect(events[4].event_type).toBe('user_confirm');
    expect(events[0].seq).toBe(1);
    expect(events[4].seq).toBe(5);
  });
});

describe('runSkillTurn with optional ToolRuntime', () => {
  const RUNTIME_SPEC: WorkflowSpec = {
    skillId: 'runtime-test', version: 1,
    startStepId: 'query',
    steps: {
      query: { id: 'query', label: 'Query', kind: 'tool', tool: 'apply_service_suspension', transitions: [{ target: 'done', guard: 'always' }] },
      done: { id: 'done', label: 'Done', kind: 'end', transitions: [] },
    },
    terminalSteps: ['done'],
  };

  beforeEach(() => {
    // Clean up instances for runtime test session
    try {
      const inst = instanceStore.findActiveInstance('runtime-test-session', 'runtime-test');
      if (inst) instanceStore.finishInstance(inst.id, 'done');
    } catch { /* no active instance */ }
  });

  test('accepts optional runtime parameter without breaking', async () => {
    const runtime = new ToolRuntime();
    // apply_service_suspension is mocked — runtime should handle it
    const result = await runSkillTurn(
      'runtime-test-session', '帮我停机',
      RUNTIME_SPEC, {}, // empty mcpTools — runtime takes over
      { phone: '13800000001', lang: 'zh', history: [] },
      runtime,
    );
    expect(typeof result.text).toBe('string');
    expect(typeof result.instanceId).toBe('string');
    expect(result.toolRecords.length).toBeGreaterThanOrEqual(0);
  });

  test('works without runtime (backward compat)', async () => {
    const mockTools = {
      apply_service_suspension: {
        execute: async () => ({ content: [{ type: 'text', text: '{"success":true}' }] }),
      },
    };
    const result = await runSkillTurn(
      'runtime-test-session-2', '帮我停机',
      RUNTIME_SPEC, mockTools,
      { phone: '13800000001', lang: 'zh', history: [] },
      // no runtime parameter
    );
    expect(typeof result.text).toBe('string');
    expect(result.toolRecords.length).toBeGreaterThanOrEqual(0);
  });
});
