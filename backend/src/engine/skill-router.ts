import { findActiveInstance } from './skill-instance-store';
import type { WorkflowSpec } from './skill-workflow-types';
import { db } from '../db';
import { skillWorkflowSpecs } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export interface RouteResult {
  mode: 'runtime' | 'legacy';
  spec?: WorkflowSpec;
  resuming: boolean;
}

const RUNTIME_ENABLED = new Set(
  (process.env.RUNTIME_ORCHESTRATED_SKILLS ?? '').split(',').filter(Boolean)
);

export function routeSkill(sessionId: string): RouteResult {
  // Check if session has an active workflow instance
  const instance = findActiveInstance(sessionId);
  if (instance) {
    const spec = loadSpec(instance.skill_id);
    if (spec) return { mode: 'runtime', spec, resuming: true };
    return { mode: 'legacy', resuming: false };
  }
  return { mode: 'legacy', resuming: false };
}

export function shouldUseRuntime(skillName: string): { use: boolean; spec?: WorkflowSpec } {
  if (RUNTIME_ENABLED.size > 0 && !RUNTIME_ENABLED.has(skillName)) {
    return { use: false };
  }
  const spec = loadSpec(skillName);
  if (!spec) return { use: false };
  return { use: true, spec };
}

/** Check if V2 engine should be used (registry-based runtime) */
export function useV2Engine(): boolean {
  return process.env.WORKFLOW_ENGINE_V2 === 'true';
}

function loadSpec(skillId: string): WorkflowSpec | undefined {
  try {
    const row = db.select().from(skillWorkflowSpecs)
      .where(and(eq(skillWorkflowSpecs.skill_id, skillId), eq(skillWorkflowSpecs.status, 'published')))
      .get();
    if (!row) return undefined;
    return JSON.parse(row.spec_json);
  } catch { return undefined; }
}
