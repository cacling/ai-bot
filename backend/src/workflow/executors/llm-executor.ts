import type { NodeExecutor, NodeExecutionResult } from '../types/execution';
import type { LlmNodeConfig } from '../types/node-configs';
import { generateText } from 'ai';
import { chatModel } from '../../engine/llm';

export const llmExecutor: NodeExecutor<LlmNodeConfig> = {
  async execute({ node, context }): Promise<NodeExecutionResult> {
    const config = node.config;

    const systemPrompt = config.systemPrompt ?? `You are an AI assistant. Current step: ${node.name ?? node.id}`;
    const userPrompt = config.userPrompt ?? (context.input.message as string) ?? '';

    // Resolve input variables
    let resolvedUserPrompt = userPrompt;
    if (config.inputMapping) {
      for (const [key, path] of Object.entries(config.inputMapping)) {
        const val = resolvePath(context.vars, path) ?? resolvePath(context.input, path);
        resolvedUserPrompt = resolvedUserPrompt.replace(`{{${key}}}`, String(val ?? ''));
      }
    }

    try {
      const result = await generateText({
        model: chatModel,
        system: systemPrompt,
        messages: [{ role: 'user', content: resolvedUserPrompt }],
        // NO tools — LLM only generates text
      });

      const outputKey = config.outputKey ?? 'answer';
      context.vars[outputKey] = result.text;

      return {
        status: 'success',
        outputs: { [outputKey]: result.text },
        nextPortIds: ['out'],
      };
    } catch (err) {
      return {
        status: 'error',
        error: { message: String(err) },
        nextPortIds: ['error'],
      };
    }
  },
};

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: any, key) => acc?.[key], obj);
}
