// ── Error Codes ────────────────────────────────────────────────────────────

export enum ErrorCode {
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  ADAPTER_ERROR = 'ADAPTER_ERROR',
  TIMEOUT = 'TIMEOUT',
  POLICY_REJECTED = 'POLICY_REJECTED',
  NO_DATA = 'NO_DATA',
  UNAUTHORIZED = 'UNAUTHORIZED',
}

const RETRYABLE = new Set([ErrorCode.TIMEOUT, ErrorCode.ADAPTER_ERROR]);

export function isRetryable(code: ErrorCode): boolean {
  return RETRYABLE.has(code);
}

// ── Request / Result ───────────────────────────────────────────────────────

/**
 * Extends the existing Channel from tool-call-middleware.ts with 'workflow'.
 * The middleware's Channel ('online' | 'voice' | 'outbound') is a subset.
 */
export type RuntimeChannel = 'online' | 'voice' | 'outbound' | 'workflow';
export type AdapterType = 'remote_mcp' | 'api' | 'db' | 'script' | 'mock';

export interface ToolRuntimeRequest {
  toolName: string;
  args: Record<string, unknown>;
  channel: RuntimeChannel;
  sessionId: string;
  userPhone?: string;
  tenantId?: string;
  lang?: 'zh' | 'en';
  activeSkillName?: string | null;
  traceId?: string;
}

export interface ToolRuntimeResult {
  success: boolean;
  hasData: boolean;
  rawText: string;
  parsed: unknown;
  source: AdapterType;
  errorCode?: ErrorCode;
  latencyMs: number;
  traceId: string;
}

// ── Contracts & Bindings (mirrors DB shape) ────────────────────────────────

export interface ToolContract {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  errorSchema?: Record<string, unknown>;
  resultSemantics?: Record<string, unknown>;
  mocked: boolean;
  disabled: boolean;
  mockRules?: string;
  serverId?: string;
  annotations?: Record<string, unknown>;
}

export interface ToolBinding {
  toolId: string;
  adapterType: AdapterType;
  connectorId?: string;
  handlerKey?: string;
  config?: Record<string, unknown>;
  executionPolicy?: ExecutionPolicy;
  status: string;
}

export interface ExecutionPolicy {
  timeoutMs?: number;
  retryCount?: number;
  idempotent?: boolean;
  allowedChannels?: RuntimeChannel[];
  confirmRequired?: boolean;
  authRequired?: boolean;
}

export interface ConnectorConfig {
  id: string;
  name: string;
  type: 'db' | 'api';
  config?: Record<string, unknown>;
  status: string;
}

// ── Adapter Interface ──────────────────────────────────────────────────────

export interface ResolvedTool {
  contract: ToolContract;
  binding: ToolBinding | null;
  connector: ConnectorConfig | null;
}

export interface AdapterCallContext {
  request: ToolRuntimeRequest;
  resolved: ResolvedTool;
  traceId: string;
}

export interface Adapter {
  type: AdapterType;
  call(ctx: AdapterCallContext): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }>;
}

// ── Pipeline Step Hooks ────────────────────────────────────────────────────

export interface GovernPolicy {
  name: string;
  check(request: ToolRuntimeRequest, resolved: ResolvedTool): string | null; // null = pass, string = rejection reason
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function makeSuccessResult(opts: {
  rawText: string;
  parsed: unknown;
  source: AdapterType;
  latencyMs: number;
  traceId: string;
  hasData?: boolean;
}): ToolRuntimeResult {
  return {
    success: true,
    hasData: opts.hasData ?? true,
    rawText: opts.rawText,
    parsed: opts.parsed,
    source: opts.source,
    latencyMs: opts.latencyMs,
    traceId: opts.traceId,
  };
}

export function makeErrorResult(opts: {
  errorCode: ErrorCode;
  rawText: string;
  source: AdapterType;
  latencyMs: number;
  traceId: string;
}): ToolRuntimeResult {
  return {
    success: false,
    hasData: false,
    rawText: opts.rawText,
    parsed: null,
    source: opts.source,
    errorCode: opts.errorCode,
    latencyMs: opts.latencyMs,
    traceId: opts.traceId,
  };
}
