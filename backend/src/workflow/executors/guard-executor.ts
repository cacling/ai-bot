import type { NodeExecutor, NodeExecutionResult } from '../types/execution';
import type { GuardNodeConfig } from '../types/node-configs';

export const guardExecutor: NodeExecutor<GuardNodeConfig> = {
  async execute({ node, context }): Promise<NodeExecutionResult> {
    const config = node.config;
    if (config.mode === 'rule' && config.expression) {
      try {
        const fn = new Function('vars', 'input', `return Boolean(${config.expression})`);
        const passed = fn(context.vars, context.input);
        return {
          status: 'success',
          outputs: { passed },
          nextPortIds: [passed ? 'approved' : 'rejected'],
        };
      } catch (err) {
        return {
          status: 'error',
          error: { message: config.failMessage ?? `Guard check failed: ${String(err)}` },
          nextPortIds: ['rejected'],
        };
      }
    }
    // Default: pass through
    return { status: 'success', outputs: { passed: true }, nextPortIds: ['approved'] };
  },
};
