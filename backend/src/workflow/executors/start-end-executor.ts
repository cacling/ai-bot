import type { NodeExecutor, NodeExecutionResult } from '../types/execution';
import type { StartNodeConfig, EndNodeConfig } from '../types/node-configs';

export const startExecutor: NodeExecutor<StartNodeConfig> = {
  async execute({ node, context }): Promise<NodeExecutionResult> {
    // Start node just passes through — input is already in context
    return { status: 'success', outputs: context.input, nextPortIds: ['out'] };
  },
};

export const endExecutor: NodeExecutor<EndNodeConfig> = {
  async execute({ node, context }): Promise<NodeExecutionResult> {
    const config = node.config;
    let output: Record<string, unknown> = {};
    if (config.outputMapping) {
      for (const [key, path] of Object.entries(config.outputMapping)) {
        output[key] = resolvePath(context.vars, path);
      }
    }
    return { status: 'success', outputs: output };
  },
};

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: any, key) => acc?.[key], obj);
}
