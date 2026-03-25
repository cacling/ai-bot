import type { NodeType } from './node-types';
import type { BaseNode } from './workflow-definition';

export interface WorkflowExecutionContext {
  workflowId: string;
  executionId: string;
  input: Record<string, unknown>;
  vars: Record<string, unknown>;
  history?: Array<Record<string, unknown>>;
  logger?: WorkflowLogger;
  now?: string;
}

export interface WorkflowLogger {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export interface NodeExecutionResult {
  status: "success" | "error" | "skipped" | "waiting_human";
  outputs?: Record<string, unknown>;
  nextPortIds?: string[];
  error?: { code?: string; message: string; details?: unknown };
  logs?: Array<{ level: "info" | "warn" | "error"; message: string; data?: unknown }>;
}

export interface NodeExecutor<TConfig = unknown> {
  execute(args: {
    node: BaseNode<NodeType, TConfig>;
    context: WorkflowExecutionContext;
  }): Promise<NodeExecutionResult>;
}
