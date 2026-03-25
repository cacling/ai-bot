import type { NodeExecutor, NodeExecutionResult } from '../types/execution';
import type { ToolNodeConfig } from '../types/node-configs';
import { executeTool, buildToolArgs } from '../../engine/skill-tool-executor';

export const toolExecutor: NodeExecutor<ToolNodeConfig> = {
  async execute({ node, context }): Promise<NodeExecutionResult> {
    const config = node.config;
    const phone = (context.input.phone as string) ?? '';
    const sessionId = context.executionId;

    // Build args from config.inputMapping + session context
    const mappedArgs: Record<string, unknown> = {};
    if (config.inputMapping) {
      for (const [param, path] of Object.entries(config.inputMapping)) {
        mappedArgs[param] = resolvePath(context.vars, path) ?? resolvePath(context.input, path);
      }
    }
    const args = buildToolArgs(config.toolRef, { phone, sessionId }, mappedArgs);

    // Get MCP tools from context (injected by runtime)
    const mcpTools = (context as any)._mcpTools ?? {};
    const result = await executeTool(config.toolRef, args, mcpTools);

    const outputKey = config.outputKey ?? 'toolResult';
    context.vars[outputKey] = result.parsed;

    return {
      status: result.success ? 'success' : 'error',
      outputs: { [outputKey]: result.parsed, _raw: result.rawText },
      nextPortIds: result.success ? ['out'] : ['error'],
      error: result.success ? undefined : { message: result.rawText },
    };
  },
};

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: any, key) => acc?.[key], obj);
}
