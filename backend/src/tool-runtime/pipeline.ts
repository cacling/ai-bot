import { randomUUID } from 'crypto';
import type {
  ToolRuntimeRequest, ToolRuntimeResult, Adapter, AdapterType,
  ResolvedTool, GovernPolicy, AdapterCallContext,
} from './types';
import { ErrorCode, makeErrorResult, makeSuccessResult } from './types';
import type { ToolRegistry } from './registry';
import { normalizeMonthParam } from '../services/query-normalizer/month';
import { logger } from '../services/logger';

export class Pipeline {
  constructor(
    private registry: ToolRegistry,
    private adapters: Partial<Record<AdapterType, Adapter>>,
    private policies: GovernPolicy[] = [],
  ) {}

  async execute(request: ToolRuntimeRequest): Promise<ToolRuntimeResult> {
    const t0 = Date.now();
    const traceId = request.traceId ?? `trc_${randomUUID().slice(0, 12)}`;

    // Step 1: Resolve
    const resolved = this.resolve(request);
    if (!resolved) {
      return makeErrorResult({
        errorCode: ErrorCode.TOOL_NOT_FOUND,
        rawText: `Tool "${request.toolName}" not found in registry`,
        source: 'remote_mcp',
        latencyMs: Date.now() - t0,
        traceId,
      });
    }

    // Step 2: Validate (parameter normalization)
    this.validate(request);

    // Step 3: Inject context
    this.inject(request, traceId);

    // Step 4: Govern (policy checks)
    const rejection = this.govern(request, resolved);
    if (rejection) {
      logger.warn('pipeline', 'policy_rejected', { tool: request.toolName, reason: rejection, trace: traceId });
      return makeErrorResult({
        errorCode: ErrorCode.POLICY_REJECTED,
        rawText: rejection,
        source: this.resolveAdapterType(resolved),
        latencyMs: Date.now() - t0,
        traceId,
      });
    }

    // Step 5: Dispatch to adapter
    const adapterType = this.resolveAdapterType(resolved);
    const adapter = this.adapters[adapterType];
    if (!adapter) {
      return makeErrorResult({
        errorCode: ErrorCode.ADAPTER_ERROR,
        rawText: `No adapter registered for type "${adapterType}"`,
        source: adapterType,
        latencyMs: Date.now() - t0,
        traceId,
      });
    }

    const ctx: AdapterCallContext = { request, resolved, traceId };

    let adapterResult: Awaited<ReturnType<Adapter['call']>>;
    try {
      adapterResult = await adapter.call(ctx);
    } catch (err) {
      logger.error('pipeline', 'adapter_error', { tool: request.toolName, adapter: adapterType, error: String(err) });
      return makeErrorResult({
        errorCode: ErrorCode.ADAPTER_ERROR,
        rawText: String(err),
        source: adapterType,
        latencyMs: Date.now() - t0,
        traceId,
      });
    }

    // Step 6: Normalize result
    const result = this.normalize(adapterResult, adapterType, traceId, Date.now() - t0);

    // Step 7: Observe (logging)
    this.observe(request, result, traceId);

    return result;
  }

  // ── Pipeline Steps ──

  private resolve(request: ToolRuntimeRequest): ResolvedTool | null {
    return this.registry.resolve(request.toolName);
  }

  private validate(request: ToolRuntimeRequest): void {
    const args = request.args;
    if (typeof args.month === 'string') {
      args.month = normalizeMonthParam(args.month);
    }
  }

  private inject(request: ToolRuntimeRequest, traceId: string): void {
    const args = request.args;
    if (!args.traceId) args.traceId = traceId;
    if (!args.sessionId) args.sessionId = request.sessionId;
    if (request.userPhone && !args.phone) args.phone = request.userPhone;
    if (request.activeSkillName && !args.operator) {
      args.operator = JSON.stringify({ type: 'ai_skill', id: request.activeSkillName });
    }
    request.traceId = traceId;
  }

  private govern(request: ToolRuntimeRequest, resolved: ResolvedTool): string | null {
    for (const policy of this.policies) {
      const rejection = policy.check(request, resolved);
      if (rejection) return rejection;
    }

    const policy = resolved.binding?.executionPolicy;
    if (policy?.allowedChannels && !policy.allowedChannels.includes(request.channel)) {
      return `Tool "${request.toolName}" is not allowed on channel "${request.channel}"`;
    }

    return null;
  }

  private resolveAdapterType(resolved: ResolvedTool): AdapterType {
    if (resolved.contract.mocked) return 'mock';
    if (resolved.binding?.adapterType) {
      const mapping: Record<string, AdapterType> = {
        script: 'remote_mcp',
        db_binding: 'remote_mcp',
        api_proxy: 'api',
        remote_mcp: 'remote_mcp',
        api: 'api',
      };
      return mapping[resolved.binding.adapterType] ?? 'remote_mcp';
    }
    return 'remote_mcp';
  }

  private normalize(
    adapterResult: { rawText: string; parsed: unknown; success: boolean; hasData: boolean },
    source: AdapterType,
    traceId: string,
    latencyMs: number,
  ): ToolRuntimeResult {
    if (adapterResult.success) {
      return makeSuccessResult({
        rawText: adapterResult.rawText,
        parsed: adapterResult.parsed,
        source,
        latencyMs,
        traceId,
        hasData: adapterResult.hasData,
      });
    }
    return makeErrorResult({
      errorCode: ErrorCode.ADAPTER_ERROR,
      rawText: adapterResult.rawText,
      source,
      latencyMs,
      traceId,
    });
  }

  private observe(request: ToolRuntimeRequest, result: ToolRuntimeResult, traceId: string): void {
    logger.info('pipeline', 'executed', {
      tool: request.toolName,
      channel: request.channel,
      source: result.source,
      success: result.success,
      hasData: result.hasData,
      latencyMs: result.latencyMs,
      trace: traceId,
    });
  }
}
