import type { NodeExecutor, NodeExecutionResult } from '../types/execution';
import type { HumanNodeConfig } from '../types/node-configs';

export const humanExecutor: NodeExecutor<HumanNodeConfig> = {
  async execute({ node, context }): Promise<NodeExecutionResult> {
    // Human node pauses the workflow — runtime handles the pause/resume
    return {
      status: 'waiting_human',
      outputs: { mode: node.config.mode },
      nextPortIds: [], // No automatic next — runtime decides based on human response
    };
  },
};
