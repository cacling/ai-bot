import { platformDb as db } from '../db';
import { skillInstances, skillInstanceEvents } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { InstanceStatus, EventType } from './skill-workflow-types';

export function createInstance(sessionId: string, skillId: string, skillVersion: number, startStepId: string) {
  const id = randomUUID();
  db.insert(skillInstances).values({
    id, session_id: sessionId, skill_id: skillId,
    skill_version: skillVersion, status: 'running',
    current_step_id: startStepId, pending_confirm: 0,
  }).run();
  return { id, sessionId, skillId, skillVersion, currentStepId: startStepId, revision: 1 };
}

export function findActiveInstance(sessionId: string) {
  return db.select().from(skillInstances)
    .where(and(
      eq(skillInstances.session_id, sessionId),
    ))
    .all()
    .find(r => r.status === 'running' || r.status === 'waiting_user') ?? null;
}

export function advanceStep(instanceId: string, nextStepId: string, currentRevision: number): boolean {
  const result = db.update(skillInstances).set({
    current_step_id: nextStepId,
    revision: currentRevision + 1,
    updated_at: new Date().toISOString(),
  }).where(and(
    eq(skillInstances.id, instanceId),
    eq(skillInstances.revision, currentRevision),
  )).run();
  return result.changes > 0;
}

export function setPendingConfirm(instanceId: string, pending: boolean): void {
  db.update(skillInstances).set({
    pending_confirm: pending ? 1 : 0,
    status: pending ? 'waiting_user' : 'running',
    updated_at: new Date().toISOString(),
  }).where(eq(skillInstances.id, instanceId)).run();
}

export function updateLastToolResult(instanceId: string, result: unknown): void {
  db.update(skillInstances).set({
    last_tool_result: JSON.stringify(result),
    updated_at: new Date().toISOString(),
  }).where(eq(skillInstances.id, instanceId)).run();
}

export function finishInstance(instanceId: string, status: 'completed' | 'escalated' | 'aborted'): void {
  db.update(skillInstances).set({
    status, finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).where(eq(skillInstances.id, instanceId)).run();
}

export function appendEvent(instanceId: string, event: {
  eventType: EventType; stepId?: string; toolName?: string; payload?: unknown;
}): void {
  const maxSeq = db.select({ max: sql<number>`MAX(seq)` }).from(skillInstanceEvents)
    .where(eq(skillInstanceEvents.instance_id, instanceId)).get();
  const seq = (maxSeq?.max ?? 0) + 1;
  db.insert(skillInstanceEvents).values({
    instance_id: instanceId, seq,
    event_type: event.eventType, step_id: event.stepId,
    tool_name: event.toolName,
    payload_json: event.payload ? JSON.stringify(event.payload) : null,
  }).run();
}

export function getEvents(instanceId: string) {
  return db.select().from(skillInstanceEvents)
    .where(eq(skillInstanceEvents.instance_id, instanceId))
    .orderBy(skillInstanceEvents.seq).all();
}
