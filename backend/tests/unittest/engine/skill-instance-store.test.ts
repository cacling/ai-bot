import { describe, test, expect, beforeEach } from 'bun:test';
import { db } from '../../../src/db';
import { skillInstances, skillInstanceEvents, sessions } from '../../../src/db/schema';
import { eq } from 'drizzle-orm';
import * as store from '../../../src/engine/skill-instance-store';

describe('SkillInstanceStore', () => {
  const testSessionId = 'test-session-store';

  beforeEach(() => {
    // Ensure test session exists
    db.delete(skillInstanceEvents).run();
    db.delete(skillInstances).run();
    try {
      db.insert(sessions).values({ id: testSessionId, phone: '13800000001', channel: 'online' }).run();
    } catch { /* already exists */ }
  });

  test('createInstance returns instance with running status', () => {
    const inst = store.createInstance(testSessionId, 'test-skill', 1, 'start');
    expect(inst.id).toBeTruthy();
    expect(inst.currentStepId).toBe('start');
    expect(inst.revision).toBe(1);
  });

  test('findActiveInstance returns null when none', () => {
    expect(store.findActiveInstance('nonexistent')).toBeNull();
  });

  test('findActiveInstance returns running instance', () => {
    store.createInstance(testSessionId, 'test-skill', 1, 'start');
    const found = store.findActiveInstance(testSessionId);
    expect(found).not.toBeNull();
    expect(found!.status).toBe('running');
  });

  test('advanceStep updates step and increments revision', () => {
    const inst = store.createInstance(testSessionId, 'test-skill', 1, 'start');
    const ok = store.advanceStep(inst.id, 'step-2', 1);
    expect(ok).toBe(true);
    const row = db.select().from(skillInstances).where(eq(skillInstances.id, inst.id)).get()!;
    expect(row.current_step_id).toBe('step-2');
    expect(row.revision).toBe(2);
  });

  test('advanceStep fails on revision mismatch', () => {
    const inst = store.createInstance(testSessionId, 'test-skill', 1, 'start');
    const ok = store.advanceStep(inst.id, 'step-2', 999);
    expect(ok).toBe(false);
  });

  test('setPendingConfirm toggles state', () => {
    const inst = store.createInstance(testSessionId, 'test-skill', 1, 'start');
    store.setPendingConfirm(inst.id, true);
    const row = db.select().from(skillInstances).where(eq(skillInstances.id, inst.id)).get()!;
    expect(row.pending_confirm).toBe(1);
    expect(row.status).toBe('waiting_user');
  });

  test('finishInstance sets status and finished_at', () => {
    const inst = store.createInstance(testSessionId, 'test-skill', 1, 'start');
    store.finishInstance(inst.id, 'completed');
    const row = db.select().from(skillInstances).where(eq(skillInstances.id, inst.id)).get()!;
    expect(row.status).toBe('completed');
    expect(row.finished_at).toBeTruthy();
  });

  test('appendEvent increments seq', () => {
    const inst = store.createInstance(testSessionId, 'test-skill', 1, 'start');
    store.appendEvent(inst.id, { eventType: 'state_enter', stepId: 'start' });
    store.appendEvent(inst.id, { eventType: 'tool_call', stepId: 'query', toolName: 'query_subscriber' });
    const events = store.getEvents(inst.id);
    expect(events.length).toBe(2);
    expect(events[0].seq).toBe(1);
    expect(events[1].seq).toBe(2);
    expect(events[1].tool_name).toBe('query_subscriber');
  });
});
