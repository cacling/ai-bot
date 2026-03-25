import type { NodeExecutor, NodeExecutionResult } from '../types/execution';
import type { IfNodeConfig } from '../types/node-configs';

export const ifExecutor: NodeExecutor<IfNodeConfig> = {
  async execute({ node, context }): Promise<NodeExecutionResult> {
    const expr = node.config.expression;
    try {
      // Safe expression evaluation using Function constructor
      // Only has access to vars and input
      const fn = new Function('vars', 'input', `return Boolean(${expr})`);
      const result = fn(context.vars, context.input);
      return {
        status: 'success',
        outputs: { condition: result },
        nextPortIds: [result ? 'true' : 'false'],
      };
    } catch (err) {
      return {
        status: 'error',
        error: { message: `Expression evaluation failed: ${expr} — ${String(err)}` },
        nextPortIds: ['error'],
      };
    }
  },
};
