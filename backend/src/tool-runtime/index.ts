export { ToolRuntime } from './runtime';

// Side-effect import: register aggregated read handlers at module load time
import './handlers/aggregated-reads';
export type {
  ToolRuntimeRequest,
  ToolRuntimeResult,
  ToolContract,
  ToolBinding,
  ConnectorConfig,
  Adapter,
  AdapterType,
  RuntimeChannel,
  GovernPolicy,
  ExecutionPolicy,
} from './types';
export { ErrorCode, isRetryable, makeSuccessResult, makeErrorResult } from './types';
export { ToolRegistry } from './registry';
export { Pipeline } from './pipeline';
