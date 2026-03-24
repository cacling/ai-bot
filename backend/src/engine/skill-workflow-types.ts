/**
 * skill-workflow-types.ts — Type definitions for compiled workflow specs
 *
 * A WorkflowSpec is the machine-readable form of a SKILL.md mermaid state diagram.
 * Produced by the compiler, consumed by SOPGuard V2.
 */

export interface WorkflowSpec {
  skillId: string;
  version: number;
  startStepId: string;
  steps: Record<string, WorkflowStep>;
  terminalSteps: string[];
}

export interface WorkflowStep {
  id: string;
  label: string;
  kind: StepKind;
  tool?: string;
  ref?: string;
  output?: string;
  transitions: WorkflowTransition[];
}

export type StepKind = 'tool' | 'confirm' | 'ref' | 'human' | 'message' | 'choice' | 'end';

export interface WorkflowTransition {
  target: string;
  guard: GuardType;
  label?: string;
}

export type GuardType =
  | 'tool.success' | 'tool.error' | 'tool.no_data'
  | 'user.confirm' | 'user.cancel'
  | 'always';

export interface CompileResult {
  spec: WorkflowSpec | null;
  errors: string[];
  warnings: string[];
}

export type InstanceStatus = 'running' | 'waiting_user' | 'completed' | 'escalated' | 'aborted';

export type EventType =
  | 'state_enter' | 'tool_call' | 'tool_result' | 'branch_taken'
  | 'user_confirm' | 'user_cancel' | 'guard_block' | 'handoff' | 'completed';
