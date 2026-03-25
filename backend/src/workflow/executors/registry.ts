import type { NodeType } from '../types/node-types';
import type { NodeExecutor } from '../types/execution';

const executors = new Map<string, NodeExecutor<any>>();

export function registerExecutor<T>(type: NodeType | string, executor: NodeExecutor<T>): void {
  executors.set(type, executor);
}

export function resolveExecutor(type: NodeType | string): NodeExecutor | undefined {
  return executors.get(type);
}

export function hasExecutor(type: NodeType | string): boolean {
  return executors.has(type);
}

export function getRegisteredTypes(): string[] {
  return [...executors.keys()];
}
