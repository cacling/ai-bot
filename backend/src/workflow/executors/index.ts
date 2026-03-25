import { NodeType } from '../types/node-types';
import { registerExecutor } from './registry';
import { startExecutor, endExecutor } from './start-end-executor';
import { toolExecutor } from './tool-executor';
import { llmExecutor } from './llm-executor';
import { humanExecutor } from './human-executor';
import { ifExecutor } from './if-executor';
import { guardExecutor } from './guard-executor';

export function registerDefaultExecutors(): void {
  registerExecutor(NodeType.Start, startExecutor);
  registerExecutor(NodeType.End, endExecutor);
  registerExecutor(NodeType.Tool, toolExecutor);
  registerExecutor(NodeType.LLM, llmExecutor);
  registerExecutor(NodeType.Human, humanExecutor);
  registerExecutor(NodeType.If, ifExecutor);
  registerExecutor(NodeType.Guard, guardExecutor);
}

export { registerExecutor, resolveExecutor, hasExecutor, getRegisteredTypes } from './registry';
