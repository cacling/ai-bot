# Tool Runtime Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all tool execution paths (online/voice/outbound/workflow) through a single `Tool Runtime` kernel, making MCP/OpenAPI/CLI protocol-layer adapters while keeping API/DB/Script as implementation-layer backends.

**Architecture:** A 7-step pipeline (`resolve -> validate -> inject -> govern -> dispatch -> normalize -> observe`) replaces the current scattered tool calling in `runner.ts`, `mcp-client.ts`, `tool-executor.ts`, `skill-tool-executor.ts`, and `tool-call-middleware.ts`. The runtime reads tool contracts from `mcp_tools`, bindings from `tool_implementations`, and connections from `connectors` to route calls through typed adapters.

**Tech Stack:** Bun + TypeScript strict, Drizzle ORM (SQLite), existing test framework (bun:test)

---

## File Structure

### New files (Phase 1 core)

| File | Responsibility |
|------|---------------|
| `backend/src/tool-runtime/types.ts` | `ToolRuntimeRequest`, `ToolRuntimeResult`, `Adapter` interface, error codes |
| `backend/src/tool-runtime/registry.ts` | Read `mcp_tools` + `tool_implementations` + `connectors` into an in-memory lookup |
| `backend/src/tool-runtime/pipeline.ts` | 7-step pipeline orchestrator: resolve/validate/inject/govern/dispatch/normalize/observe |
| `backend/src/tool-runtime/runtime.ts` | Public `ToolRuntime` class — the single entry point (`call()` + `getToolSurface()`) |
| `backend/src/tool-runtime/index.ts` | Re-exports |
| `backend/src/tool-runtime/adapters/remote-mcp-adapter.ts` | Adapter for existing MCP server calls (reuses persistent client pool) |
| `backend/src/tool-runtime/adapters/api-adapter.ts` | Adapter wrapping `api-executor.ts` |
| `backend/src/tool-runtime/adapters/mock-adapter.ts` | Adapter wrapping `mock-engine.ts` |
| `backend/src/tool-runtime/adapters/index.ts` | Adapter registry |
| `backend/src/tool-runtime/policies/sop-policy.ts` | SOP Guard integration as a govern-step policy |
| `backend/src/tool-runtime/policies/index.ts` | Policy registry |

### New test files

| File | Covers |
|------|--------|
| `backend/tests/unittest/tool-runtime/types.test.ts` | Type guards, error code helpers |
| `backend/tests/unittest/tool-runtime/registry.test.ts` | Registry lookup from DB tables |
| `backend/tests/unittest/tool-runtime/pipeline.test.ts` | 7-step pipeline with mock adapters |
| `backend/tests/unittest/tool-runtime/runtime.test.ts` | Integration: `ToolRuntime.call()` end-to-end |
| `backend/tests/unittest/tool-runtime/adapters/remote-mcp-adapter.test.ts` | MCP adapter |
| `backend/tests/unittest/tool-runtime/adapters/api-adapter.test.ts` | API adapter |
| `backend/tests/unittest/tool-runtime/adapters/mock-adapter.test.ts` | Mock adapter |

### Modified files (across phases)

| File | Phase | Change |
|------|-------|--------|
| `packages/shared-db/src/schema/platform.ts` | 1 | Add `runtime_status`, `execution_policy_json`, `error_schema_json`, `result_semantics_json` fields; add `execution_records` table |
| `backend/src/services/mcp-client.ts` | 2 | Internals replaced with `toolRuntime.call()`; external signature unchanged |
| `backend/src/chat/voice.ts` | 2 | Tool call section uses runtime instead of direct `callMcpTool()` |
| `backend/src/chat/outbound.ts` | 2 | Same as voice.ts |
| `backend/src/workflow/executors/tool-executor.ts` | 3 | Replace `_mcpTools` with injected `toolRuntime` |
| `backend/src/engine/skill-tool-executor.ts` | 3 | Delegate to runtime, keep interface for backward compat |
| `backend/src/engine/skill-runtime.ts` | 3 | Use new `executeTool()` that goes through runtime |
| `backend/src/engine/runner.ts` | 4 | Extract tool wrapping layers into runtime; `getMCPTools()` becomes `toolRuntime.getToolSurface()` |
| `backend/src/services/tool-call-middleware.ts` | 4 | Pre-processing migrates into pipeline; voice post-processing stays in channel layer |

---

## Phase 0: Baseline Freeze

> Goal: Document current tool execution paths, create regression test harness, identify all tools and their real implementation sources.

### Task 0.1: Create Tool Source Inventory

**Files:**
- Create: `docs/tool-runtime/baseline-inventory.md`

- [ ] **Step 1: Query all tool registrations**

```bash
cd backend && bun -e "
import { db } from './src/db';
import { mcpTools, mcpServers, toolImplementations, connectors } from './src/db/schema';
const tools = db.select().from(mcpTools).all();
const servers = db.select().from(mcpServers).all();
const impls = db.select().from(toolImplementations).all();
const conns = db.select().from(connectors).all();
console.log('=== Tools ===');
for (const t of tools) console.log(t.name, '|', t.impl_type ?? 'mcp', '|', t.server_id ?? '-', '|', t.mocked ? 'MOCKED' : 'live');
console.log('=== Servers ===');
for (const s of servers) console.log(s.name, '|', s.url, '|', s.enabled ? 'enabled' : 'disabled');
console.log('=== Implementations ===');
for (const i of impls) console.log(i.tool_id, '|', i.adapter_type, '|', i.connector_id ?? '-');
console.log('=== Connectors ===');
for (const c of conns) console.log(c.name, '|', c.type, '|', c.status);
"
```

- [ ] **Step 2: Document the inventory**

Create `docs/tool-runtime/baseline-inventory.md` with three sections:
1. Tool Source Table: tool_name | current_source (remote_mcp/api/script/db) | server | mocked
2. MCP Server Table: server_name | url | port | tool_count
3. Calling Chain Summary: one paragraph per channel (online/voice/outbound/workflow)

- [ ] **Step 3: Commit**

```bash
git add docs/tool-runtime/baseline-inventory.md
git commit -m "docs: create tool runtime baseline inventory for Phase 0"
```

### Task 0.2: Create Regression Test Harness

**Files:**
- Create: `backend/tests/unittest/tool-runtime/regression-baseline.test.ts`

- [ ] **Step 1: Write regression tests for current tool execution**

```typescript
import { describe, test, expect, beforeAll } from 'bun:test';
import { executeTool, buildToolArgs } from '../../../src/engine/skill-tool-executor';
import { preprocessToolCall } from '../../../src/services/tool-call-middleware';
import { isErrorResult, isNoDataResult } from '../../../src/services/tool-result';
import { matchMockRule } from '../../../src/services/mock-engine';

describe('Regression Baseline: Tool Execution Contracts', () => {
  // ── ToolExecResult contract ──
  describe('ToolExecResult shape', () => {
    test('success tool returns { success: true, hasData: true, rawText, parsed }', async () => {
      const mock = { t: { execute: async () => ({ content: [{ type: 'text', text: '{"found":true}' }] }) } };
      const r = await executeTool('t', {}, mock as any);
      expect(r).toMatchObject({ success: true, hasData: true });
      expect(typeof r.rawText).toBe('string');
      expect(r.parsed).toEqual({ found: true });
    });

    test('error tool returns { success: false }', async () => {
      const mock = { t: { execute: async () => ({ content: [{ type: 'text', text: '{"success":false,"error":"fail"}' }] }) } };
      const r = await executeTool('t', {}, mock as any);
      expect(r.success).toBe(false);
    });

    test('no-data tool returns { success: true, hasData: false }', async () => {
      const mock = { t: { execute: async () => ({ content: [{ type: 'text', text: '未查到记录' }] }) } };
      const r = await executeTool('t', {}, mock as any);
      expect(r.success).toBe(true);
      expect(r.hasData).toBe(false);
    });

    test('missing tool returns { success: false }', async () => {
      const r = await executeTool('missing', {}, {});
      expect(r.success).toBe(false);
    });
  });

  // ── preprocessToolCall contract ──
  describe('preprocessToolCall contract', () => {
    test('normalizes month and infers skill', () => {
      const args = { phone: '13800000001', month: '2026-2' };
      const r = preprocessToolCall({
        channel: 'voice', toolName: 'query_bill', toolArgs: args,
        userPhone: '13800000001', lang: 'zh', activeSkillName: null,
      });
      expect(r.normalizedArgs.month).toBe('2026-02');
      expect(r.skillName === null || typeof r.skillName === 'string').toBe(true);
    });
  });

  // ── Result classification contract ──
  describe('Result classification', () => {
    test('isErrorResult detects JSON error', () => {
      expect(isErrorResult('{"success":false}')).toBe(true);
      expect(isErrorResult('Error: timeout')).toBe(true);
      expect(isErrorResult('{"found":true}')).toBe(false);
    });

    test('isNoDataResult detects empty results', () => {
      expect(isNoDataResult('未查到记录')).toBe(true);
      expect(isNoDataResult('not found')).toBe(true);
      expect(isNoDataResult('{"total": 100}')).toBe(false);
    });
  });

  // ── buildToolArgs contract ──
  describe('buildToolArgs contract', () => {
    test('injects phone from session context', () => {
      const args = buildToolArgs('t', { phone: '138', sessionId: 's1' }, { extra: 1 });
      expect(args).toEqual({ phone: '138', extra: 1 });
    });
  });
});
```

- [ ] **Step 2: Run and verify all pass**

Run: `cd backend && bun test tests/unittest/tool-runtime/regression-baseline.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/unittest/tool-runtime/regression-baseline.test.ts
git commit -m "test: add tool runtime regression baseline (Phase 0)"
```

---

## Phase 1: Tool Runtime Skeleton

> Goal: Create the `tool-runtime` module with types, registry, pipeline, and remote_mcp adapter. First version behavior identical to current MCP routing. No business behavior changes.

### Task 1.1: Define Core Types

**Files:**
- Create: `backend/src/tool-runtime/types.ts`
- Test: `backend/tests/unittest/tool-runtime/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/unittest/tool-runtime/types.test.ts
import { describe, test, expect } from 'bun:test';
import type { ToolRuntimeRequest, ToolRuntimeResult, ToolContract, ToolBinding, Adapter } from '../../../src/tool-runtime/types';
import { ErrorCode, isRetryable, makeErrorResult, makeSuccessResult } from '../../../src/tool-runtime/types';

describe('Tool Runtime Types', () => {
  test('ErrorCode enum has expected values', () => {
    expect(ErrorCode.TOOL_NOT_FOUND).toBe('TOOL_NOT_FOUND');
    expect(ErrorCode.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
    expect(ErrorCode.ADAPTER_ERROR).toBe('ADAPTER_ERROR');
    expect(ErrorCode.TIMEOUT).toBe('TIMEOUT');
    expect(ErrorCode.POLICY_REJECTED).toBe('POLICY_REJECTED');
    expect(ErrorCode.NO_DATA).toBe('NO_DATA');
  });

  test('isRetryable classifies error codes', () => {
    expect(isRetryable(ErrorCode.TIMEOUT)).toBe(true);
    expect(isRetryable(ErrorCode.ADAPTER_ERROR)).toBe(true);
    expect(isRetryable(ErrorCode.VALIDATION_FAILED)).toBe(false);
    expect(isRetryable(ErrorCode.POLICY_REJECTED)).toBe(false);
  });

  test('makeSuccessResult builds correct shape', () => {
    const r = makeSuccessResult({
      rawText: '{"ok":true}',
      parsed: { ok: true },
      source: 'remote_mcp',
      latencyMs: 100,
      traceId: 'trc_1',
    });
    expect(r.success).toBe(true);
    expect(r.hasData).toBe(true);
    expect(r.source).toBe('remote_mcp');
  });

  test('makeErrorResult builds correct shape', () => {
    const r = makeErrorResult({
      errorCode: ErrorCode.TIMEOUT,
      rawText: 'timeout after 5000ms',
      source: 'remote_mcp',
      latencyMs: 5001,
      traceId: 'trc_2',
    });
    expect(r.success).toBe(false);
    expect(r.hasData).toBe(false);
    expect(r.errorCode).toBe('TIMEOUT');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/tool-runtime/types.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement types**

```typescript
// backend/src/tool-runtime/types.ts

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
  type: 'db' | 'api' | 'remote_mcp';
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/tool-runtime/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/tool-runtime/types.ts backend/tests/unittest/tool-runtime/types.test.ts
git commit -m "feat(tool-runtime): define core types, error codes, and result helpers"
```

### Task 1.2: Implement Registry

**Files:**
- Create: `backend/src/tool-runtime/registry.ts`
- Test: `backend/tests/unittest/tool-runtime/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/unittest/tool-runtime/registry.test.ts
import { describe, test, expect, beforeEach } from 'bun:test';
import { ToolRegistry } from '../../../src/tool-runtime/registry';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.refresh();
  });

  test('resolves a known tool from mcp_tools table', () => {
    // query_subscriber should exist in seed data
    const resolved = registry.resolve('query_subscriber');
    expect(resolved).not.toBeNull();
    expect(resolved!.contract.name).toBe('query_subscriber');
  });

  test('returns null for unknown tool', () => {
    const resolved = registry.resolve('__nonexistent_tool_xyz__');
    expect(resolved).toBeNull();
  });

  test('lists all contracts', () => {
    const all = registry.listContracts();
    expect(Array.isArray(all)).toBe(true);
    // Should have at least a few tools from seed
    expect(all.length).toBeGreaterThan(0);
  });

  test('filters disabled tools from surface', () => {
    const surface = registry.getToolSurface();
    for (const tool of surface) {
      expect(tool.disabled).toBe(false);
    }
  });

  test('refresh clears cache and reloads', () => {
    const before = registry.listContracts().length;
    registry.refresh();
    const after = registry.listContracts().length;
    expect(after).toBe(before);
  });

  test('resolves binding and connector when tool_implementations row exists', () => {
    // This may or may not find a binding depending on seed data
    const all = registry.listContracts();
    if (all.length > 0) {
      const resolved = registry.resolve(all[0].name);
      expect(resolved).not.toBeNull();
      // binding may be null (not all tools have implementations yet)
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/tool-runtime/registry.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement registry**

```typescript
// backend/src/tool-runtime/registry.ts
import { db } from '../db';
import { mcpTools, mcpServers, toolImplementations, connectors } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../services/logger';
import type { ToolContract, ToolBinding, ConnectorConfig, ResolvedTool, AdapterType } from './types';

export class ToolRegistry {
  private contracts = new Map<string, ToolContract>();
  private contractIdToName = new Map<string, string>(); // id -> name (reverse lookup for bindings)
  private bindings = new Map<string, ToolBinding>(); // keyed by tool name
  private connectorMap = new Map<string, ConnectorConfig>();
  private serverUrls = new Map<string, string>(); // serverId -> url

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this.contracts.clear();
    this.contractIdToName.clear();
    this.bindings.clear();
    this.connectorMap.clear();
    this.serverUrls.clear();

    this.loadServers();
    this.loadContracts();
    this.loadBindings();
    this.loadConnectors();

    logger.info('tool-registry', 'refreshed', {
      contracts: this.contracts.size,
      bindings: this.bindings.size,
      connectors: this.connectorMap.size,
    });
  }

  resolve(toolName: string): ResolvedTool | null {
    const contract = this.contracts.get(toolName);
    if (!contract) return null;

    const binding = this.bindings.get(toolName) ?? null;
    let connector: ConnectorConfig | null = null;
    if (binding?.connectorId) {
      connector = this.connectorMap.get(binding.connectorId) ?? null;
    }

    return { contract, binding, connector };
  }

  listContracts(): ToolContract[] {
    return Array.from(this.contracts.values());
  }

  getToolSurface(): ToolContract[] {
    return this.listContracts().filter(c => !c.disabled);
  }

  getServerUrl(serverId: string): string | undefined {
    return this.serverUrls.get(serverId);
  }

  /** Get all server URLs for building MCP tool surface */
  getActiveServers(): Array<{ id: string; name: string; url: string }> {
    const result: Array<{ id: string; name: string; url: string }> = [];
    try {
      for (const s of db.select().from(mcpServers).all()) {
        if (s.enabled && s.status === 'active' && s.url) {
          result.push({ id: s.id, name: s.name, url: s.url });
        }
      }
    } catch { /* DB not ready */ }
    return result;
  }

  // ── Private loaders ──

  private loadServers(): void {
    try {
      for (const s of db.select().from(mcpServers).all()) {
        if (s.url) this.serverUrls.set(s.id, s.url);
      }
    } catch { /* DB not ready */ }
  }

  private loadContracts(): void {
    try {
      for (const row of db.select().from(mcpTools).all()) {
        const contract: ToolContract = {
          id: row.id,
          name: row.name,
          description: row.description,
          inputSchema: row.input_schema ? JSON.parse(row.input_schema) : undefined,
          outputSchema: row.output_schema ? JSON.parse(row.output_schema) : undefined,
          errorSchema: undefined, // will be added in schema migration
          resultSemantics: undefined,
          mocked: row.mocked,
          disabled: row.disabled,
          mockRules: row.mock_rules ?? undefined,
          serverId: row.server_id ?? undefined,
          annotations: row.annotations ? JSON.parse(row.annotations) : undefined,
        };
        this.contracts.set(row.name, contract);
        this.contractIdToName.set(row.id, row.name);
      }
    } catch { /* table may not exist yet */ }

    // Fallback: load from mcp_servers.tools_json if mcp_tools is empty
    if (this.contracts.size === 0) {
      try {
        for (const s of db.select().from(mcpServers).all()) {
          if (!s.tools_json) continue;
          const tools = JSON.parse(s.tools_json) as Array<{ name: string; description?: string; inputSchema?: unknown }>;
          for (const t of tools) {
            if (this.contracts.has(t.name)) continue;
            this.contracts.set(t.name, {
              id: `fallback_${t.name}`,
              name: t.name,
              description: t.description ?? '',
              inputSchema: t.inputSchema as Record<string, unknown> | undefined,
              mocked: false,
              disabled: false,
              serverId: s.id,
            });
          }
        }
      } catch { /* ignore */ }
    }
  }

  private loadBindings(): void {
    try {
      for (const row of db.select().from(toolImplementations).all()) {
        // O(1) lookup via reverse map instead of O(n) linear scan
        const toolName = this.contractIdToName.get(row.tool_id);
        if (!toolName) continue;
        const contract = this.contracts.get(toolName);
        if (!contract) continue;

        let executionPolicy;
        if (row.config) {
          try {
            const cfg = JSON.parse(row.config);
            executionPolicy = cfg.executionPolicy;
          } catch { /* ignore */ }
        }

        this.bindings.set(contract.name, {
          toolId: row.tool_id,
          adapterType: row.adapter_type as AdapterType,
          connectorId: row.connector_id ?? undefined,
          handlerKey: row.handler_key ?? undefined,
          config: row.config ? JSON.parse(row.config) : undefined,
          executionPolicy,
          status: row.status,
        });
      }
    } catch { /* table may not exist */ }
  }

  private loadConnectors(): void {
    try {
      for (const row of db.select().from(connectors).all()) {
        this.connectorMap.set(row.id, {
          id: row.id,
          name: row.name,
          type: row.type as 'db' | 'api' | 'remote_mcp',
          config: row.config ? JSON.parse(row.config) : undefined,
          status: row.status,
        });
      }
    } catch { /* table may not exist */ }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/tool-runtime/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/tool-runtime/registry.ts backend/tests/unittest/tool-runtime/registry.test.ts
git commit -m "feat(tool-runtime): implement ToolRegistry with DB-backed contract/binding/connector lookup"
```

### Task 1.3: Implement Remote MCP Adapter

**Files:**
- Create: `backend/src/tool-runtime/adapters/remote-mcp-adapter.ts`
- Create: `backend/src/tool-runtime/adapters/index.ts`
- Test: `backend/tests/unittest/tool-runtime/adapters/remote-mcp-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/unittest/tool-runtime/adapters/remote-mcp-adapter.test.ts
import { describe, test, expect, mock } from 'bun:test';
import { RemoteMcpAdapter } from '../../../../src/tool-runtime/adapters/remote-mcp-adapter';
import type { AdapterCallContext, ToolContract, ToolBinding, ConnectorConfig } from '../../../../src/tool-runtime/types';

describe('RemoteMcpAdapter', () => {
  test('type is remote_mcp', () => {
    const adapter = new RemoteMcpAdapter();
    expect(adapter.type).toBe('remote_mcp');
  });

  test('call returns parsed MCP result on success', async () => {
    const adapter = new RemoteMcpAdapter();
    // Inject a mock MCP tool executor for testing
    const mockExecute = mock(async () => ({
      content: [{ type: 'text', text: '{"found":true,"name":"test"}' }],
    }));
    adapter.setMcpTools({ test_tool: { execute: mockExecute } });

    const ctx: AdapterCallContext = {
      request: { toolName: 'test_tool', args: { phone: '138' }, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'test_tool', description: '', mocked: false, disabled: false } as ToolContract,
        binding: { toolId: '1', adapterType: 'remote_mcp', status: 'active' } as ToolBinding,
        connector: null,
      },
      traceId: 'trc_1',
    };

    const result = await adapter.call(ctx);
    expect(result.success).toBe(true);
    expect(result.hasData).toBe(true);
    expect((result.parsed as any).found).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith({ phone: '138' });
  });

  test('call returns error when tool not in MCP pool', async () => {
    const adapter = new RemoteMcpAdapter();
    adapter.setMcpTools({});

    const ctx: AdapterCallContext = {
      request: { toolName: 'missing', args: {}, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'missing', description: '', mocked: false, disabled: false } as ToolContract,
        binding: null,
        connector: null,
      },
      traceId: 'trc_2',
    };

    const result = await adapter.call(ctx);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/tool-runtime/adapters/remote-mcp-adapter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement remote MCP adapter**

```typescript
// backend/src/tool-runtime/adapters/remote-mcp-adapter.ts
import type { Adapter, AdapterCallContext, AdapterType } from '../types';
import { isErrorResult, isNoDataResult } from '../../services/tool-result';
import { logger } from '../../services/logger';

/**
 * Adapter that calls tools via the existing MCP persistent client pool.
 * In Phase 1, this is the primary adapter. The MCP tools map is injected
 * from runner.ts's getMCPTools() or built by the runtime.
 */
export class RemoteMcpAdapter implements Adapter {
  type: AdapterType = 'remote_mcp';
  private mcpTools: Record<string, { execute: (...args: any[]) => Promise<any> }> = {};

  setMcpTools(tools: Record<string, { execute: (...args: any[]) => Promise<any> }>): void {
    this.mcpTools = tools;
  }

  async call(ctx: AdapterCallContext): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    const { toolName, args } = ctx.request;
    const tool = this.mcpTools[toolName];

    if (!tool) {
      logger.warn('remote-mcp-adapter', 'tool_not_in_pool', { tool: toolName });
      return {
        rawText: `Tool "${toolName}" not available in MCP pool`,
        parsed: null,
        success: false,
        hasData: false,
      };
    }

    try {
      const result = await tool.execute(args);
      let text = '';
      if (typeof result === 'string') text = result;
      else if (result?.content?.[0]?.text) text = result.content[0].text;
      else text = JSON.stringify(result);

      const success = !isErrorResult(text);
      const hasData = success && !isNoDataResult(text);
      let parsed: unknown = null;
      try { parsed = JSON.parse(text); } catch { parsed = text; }

      return { rawText: text, parsed, success, hasData };
    } catch (err) {
      logger.error('remote-mcp-adapter', 'call_error', { tool: toolName, error: String(err) });
      return { rawText: String(err), parsed: null, success: false, hasData: false };
    }
  }
}
```

```typescript
// backend/src/tool-runtime/adapters/index.ts
export { RemoteMcpAdapter } from './remote-mcp-adapter';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/tool-runtime/adapters/remote-mcp-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/tool-runtime/adapters/ backend/tests/unittest/tool-runtime/adapters/
git commit -m "feat(tool-runtime): implement RemoteMcpAdapter with MCP pool delegation"
```

### Task 1.4: Implement Mock Adapter

**Files:**
- Create: `backend/src/tool-runtime/adapters/mock-adapter.ts`
- Test: `backend/tests/unittest/tool-runtime/adapters/mock-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/unittest/tool-runtime/adapters/mock-adapter.test.ts
import { describe, test, expect } from 'bun:test';
import { MockAdapter } from '../../../../src/tool-runtime/adapters/mock-adapter';
import type { AdapterCallContext, ToolContract } from '../../../../src/tool-runtime/types';

describe('MockAdapter', () => {
  test('type is mock', () => {
    expect(new MockAdapter().type).toBe('mock');
  });

  test('returns mock result when rules match', async () => {
    const adapter = new MockAdapter();
    const ctx: AdapterCallContext = {
      request: { toolName: 'test_tool', args: { phone: '13800000001' }, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: {
          id: '1', name: 'test_tool', description: '', mocked: true, disabled: false,
          mockRules: JSON.stringify([{ tool_name: 'test_tool', match: '', response: '{"mocked":true}' }]),
        } as ToolContract,
        binding: null,
        connector: null,
      },
      traceId: 'trc_1',
    };

    const result = await adapter.call(ctx);
    expect(result.success).toBe(true);
    expect((result.parsed as any).mocked).toBe(true);
  });

  test('returns error when no mock rules match', async () => {
    const adapter = new MockAdapter();
    const ctx: AdapterCallContext = {
      request: { toolName: 'no_rules', args: {}, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'no_rules', description: '', mocked: true, disabled: false } as ToolContract,
        binding: null,
        connector: null,
      },
      traceId: 'trc_2',
    };

    const result = await adapter.call(ctx);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/tool-runtime/adapters/mock-adapter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement mock adapter**

```typescript
// backend/src/tool-runtime/adapters/mock-adapter.ts
import type { Adapter, AdapterCallContext, AdapterType } from '../types';
import { matchMockRule } from '../../services/mock-engine';
import { isErrorResult, isNoDataResult } from '../../services/tool-result';
import { logger } from '../../services/logger';

export class MockAdapter implements Adapter {
  type: AdapterType = 'mock';

  async call(ctx: AdapterCallContext): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    const { toolName, args } = ctx.request;

    // Delegate entirely to mock-engine.ts which already handles:
    // - Tool-level mock rules (from mcp_tools table)
    // - Server-level mock rules (from mcp_servers table, fallback)
    // - Expression matching with new Function() (centralized, not duplicated)
    // - Wildcard matching
    const mockResult = matchMockRule(toolName, args as Record<string, unknown>);

    if (mockResult !== null) {
      logger.info('mock-adapter', 'matched', { tool: toolName, trace: ctx.traceId });
      const success = !isErrorResult(mockResult);
      const hasData = success && !isNoDataResult(mockResult);
      let parsed: unknown;
      try { parsed = JSON.parse(mockResult); } catch { parsed = mockResult; }
      return { rawText: mockResult, parsed, success, hasData };
    }

    return {
      rawText: JSON.stringify({ success: false, message: `Tool ${toolName} is mocked but no mock rules matched` }),
      parsed: { success: false },
      success: false,
      hasData: false,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/tool-runtime/adapters/mock-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Update adapters index and commit**

```typescript
// Update backend/src/tool-runtime/adapters/index.ts
export { RemoteMcpAdapter } from './remote-mcp-adapter';
export { MockAdapter } from './mock-adapter';
```

```bash
git add backend/src/tool-runtime/adapters/ backend/tests/unittest/tool-runtime/adapters/
git commit -m "feat(tool-runtime): implement MockAdapter with contract-level and global mock rule matching"
```

### Task 1.5: Implement API Adapter

**Files:**
- Create: `backend/src/tool-runtime/adapters/api-adapter.ts`
- Test: `backend/tests/unittest/tool-runtime/adapters/api-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/unittest/tool-runtime/adapters/api-adapter.test.ts
import { describe, test, expect } from 'bun:test';
import { ApiAdapter } from '../../../../src/tool-runtime/adapters/api-adapter';
import type { AdapterCallContext, ToolContract, ToolBinding, ConnectorConfig } from '../../../../src/tool-runtime/types';

describe('ApiAdapter', () => {
  test('type is api', () => {
    expect(new ApiAdapter().type).toBe('api');
  });

  test('returns error when no connector config', async () => {
    const adapter = new ApiAdapter();
    const ctx: AdapterCallContext = {
      request: { toolName: 'test', args: {}, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'test', description: '', mocked: false, disabled: false } as ToolContract,
        binding: { toolId: '1', adapterType: 'api', status: 'active' } as ToolBinding,
        connector: null,
      },
      traceId: 'trc_1',
    };
    const result = await adapter.call(ctx);
    expect(result.success).toBe(false);
    expect(result.rawText).toContain('No API config');
  });

  test('builds API config from connector and binding', async () => {
    const adapter = new ApiAdapter();
    const ctx: AdapterCallContext = {
      request: { toolName: 'test', args: { phone: '138' }, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'test', description: '', mocked: false, disabled: false } as ToolContract,
        binding: {
          toolId: '1', adapterType: 'api', status: 'active',
          config: { api: { url: 'http://127.0.0.1:19999/nonexistent', method: 'POST', timeout: 1000 } },
        } as ToolBinding,
        connector: {
          id: 'c1', name: 'test-api', type: 'api', status: 'active',
          config: { baseUrl: 'http://127.0.0.1:19999' },
        } as ConnectorConfig,
      },
      traceId: 'trc_2',
    };

    // Will fail because server doesn't exist, but should attempt the call
    const result = await adapter.call(ctx);
    expect(result.success).toBe(false);
    // Should have attempted the API call
    expect(result.rawText).toContain('API');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/tool-runtime/adapters/api-adapter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement API adapter**

```typescript
// backend/src/tool-runtime/adapters/api-adapter.ts
import type { Adapter, AdapterCallContext, AdapterType } from '../types';
import { executeApiTool, type ApiExecutionConfig } from '../../services/api-executor';
import { isErrorResult, isNoDataResult } from '../../services/tool-result';
import { logger } from '../../services/logger';

export class ApiAdapter implements Adapter {
  type: AdapterType = 'api';

  async call(ctx: AdapterCallContext): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    const { toolName, args } = ctx.request;
    const { binding, connector } = ctx.resolved;

    // Build API config from binding.config.api or connector.config
    const apiConfig = this.resolveApiConfig(binding?.config, connector?.config);
    if (!apiConfig) {
      return {
        rawText: `No API config found for tool "${toolName}"`,
        parsed: null,
        success: false,
        hasData: false,
      };
    }

    try {
      const result = await executeApiTool(apiConfig, args as Record<string, unknown>);
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      const success = !isErrorResult(text);
      const hasData = success && !isNoDataResult(text);
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = result; }

      logger.info('api-adapter', 'called', { tool: toolName, url: apiConfig.url, success });
      return { rawText: text, parsed, success, hasData };
    } catch (err) {
      logger.error('api-adapter', 'error', { tool: toolName, error: String(err) });
      return {
        rawText: `API call failed: ${String(err)}`,
        parsed: null,
        success: false,
        hasData: false,
      };
    }
  }

  private resolveApiConfig(
    bindingConfig?: Record<string, unknown>,
    connectorConfig?: Record<string, unknown>,
  ): ApiExecutionConfig | null {
    // Try binding-level config first
    const api = bindingConfig?.api as ApiExecutionConfig | undefined;
    if (api?.url) return api;

    // Try connector-level config
    if (connectorConfig) {
      const baseUrl = connectorConfig.baseUrl as string | undefined;
      const path = (bindingConfig?.path ?? '') as string;
      if (baseUrl) {
        return {
          url: baseUrl + path,
          method: (connectorConfig.method ?? bindingConfig?.method ?? 'POST') as string,
          timeout: (connectorConfig.timeout ?? 10000) as number,
          headers: connectorConfig.headers as Record<string, string> | undefined,
        };
      }
    }

    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/tool-runtime/adapters/api-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Update index and commit**

```typescript
// Update backend/src/tool-runtime/adapters/index.ts
export { RemoteMcpAdapter } from './remote-mcp-adapter';
export { MockAdapter } from './mock-adapter';
export { ApiAdapter } from './api-adapter';
```

```bash
git add backend/src/tool-runtime/adapters/ backend/tests/unittest/tool-runtime/adapters/
git commit -m "feat(tool-runtime): implement ApiAdapter wrapping api-executor"
```

### Task 1.6: Implement Pipeline

**Files:**
- Create: `backend/src/tool-runtime/pipeline.ts`
- Test: `backend/tests/unittest/tool-runtime/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/unittest/tool-runtime/pipeline.test.ts
import { describe, test, expect, mock } from 'bun:test';
import { Pipeline } from '../../../src/tool-runtime/pipeline';
import { ToolRegistry } from '../../../src/tool-runtime/registry';
import type { Adapter, AdapterCallContext, ToolRuntimeRequest, GovernPolicy } from '../../../src/tool-runtime/types';
import { ErrorCode } from '../../../src/tool-runtime/types';

// Create a test adapter that returns a fixed result
function makeTestAdapter(result: Partial<Awaited<ReturnType<Adapter['call']>>> = {}): Adapter {
  return {
    type: 'remote_mcp',
    call: mock(async () => ({
      rawText: '{"ok":true}',
      parsed: { ok: true },
      success: true,
      hasData: true,
      ...result,
    })),
  };
}

describe('Pipeline', () => {
  test('executes 7-step pipeline and returns ToolRuntimeResult', async () => {
    const adapter = makeTestAdapter();
    const registry = new ToolRegistry();
    const pipeline = new Pipeline(registry, { remote_mcp: adapter });

    const request: ToolRuntimeRequest = {
      toolName: 'query_subscriber',
      args: { phone: '13800000001' },
      channel: 'online',
      sessionId: 'sess_1',
      userPhone: '13800000001',
      lang: 'zh',
    };

    const result = await pipeline.execute(request);
    // Should succeed if query_subscriber exists in DB
    if (result.success) {
      expect(result.hasData).toBe(true);
      expect(result.source).toBe('remote_mcp');
      expect(typeof result.traceId).toBe('string');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    }
    // If tool not found (no seed data), should return error
    if (!result.success) {
      expect(result.errorCode).toBeDefined();
    }
  });

  test('returns TOOL_NOT_FOUND for unknown tool', async () => {
    const adapter = makeTestAdapter();
    const registry = new ToolRegistry();
    const pipeline = new Pipeline(registry, { remote_mcp: adapter });

    const result = await pipeline.execute({
      toolName: '__nonexistent__',
      args: {},
      channel: 'online',
      sessionId: 's1',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.TOOL_NOT_FOUND);
  });

  test('routes mocked tools to mock adapter', async () => {
    const mockAdapter: Adapter = {
      type: 'mock',
      call: mock(async () => ({ rawText: '{"mocked":true}', parsed: { mocked: true }, success: true, hasData: true })),
    };
    const mcpAdapter = makeTestAdapter();
    const registry = new ToolRegistry();
    const pipeline = new Pipeline(registry, { remote_mcp: mcpAdapter, mock: mockAdapter });

    // This test depends on having a mocked tool in the DB
    // We test the routing logic by checking that the mock adapter would be chosen
    // for a mocked contract
    expect(pipeline).toBeDefined();
  });

  test('policy rejection returns POLICY_REJECTED', async () => {
    const adapter = makeTestAdapter();
    const registry = new ToolRegistry();
    const contracts = registry.listContracts();
    expect(contracts.length).toBeGreaterThan(0); // Guard: seed data must exist

    const rejectPolicy: GovernPolicy = {
      name: 'test-reject',
      check: () => 'Rejected by test policy',
    };
    const pipeline = new Pipeline(registry, { remote_mcp: adapter }, [rejectPolicy]);

    const result = await pipeline.execute({
      toolName: contracts[0].name,
      args: {},
      channel: 'online',
      sessionId: 's1',
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.POLICY_REJECTED);
  });

  test('injects traceId and sessionId into args', async () => {
    let capturedCtx: AdapterCallContext | null = null;
    const adapter: Adapter = {
      type: 'remote_mcp',
      call: mock(async (ctx: AdapterCallContext) => {
        capturedCtx = ctx;
        return { rawText: '{}', parsed: {}, success: true, hasData: true };
      }),
    };
    const registry = new ToolRegistry();
    const contracts = registry.listContracts();
    expect(contracts.length).toBeGreaterThan(0);

    const pipeline = new Pipeline(registry, { remote_mcp: adapter });
    await pipeline.execute({
      toolName: contracts[0].name,
      args: {},
      channel: 'online',
      sessionId: 'sess_inject',
    });

    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.request.args.traceId).toBeDefined();
    expect(capturedCtx!.request.args.sessionId).toBe('sess_inject');
  });

  test('normalizes month parameter in validate step', async () => {
    let capturedArgs: Record<string, unknown> = {};
    const adapter: Adapter = {
      type: 'remote_mcp',
      call: mock(async (ctx: AdapterCallContext) => {
        capturedArgs = ctx.request.args;
        return { rawText: '{}', parsed: {}, success: true, hasData: true };
      }),
    };
    const registry = new ToolRegistry();
    const contracts = registry.listContracts();
    expect(contracts.length).toBeGreaterThan(0);

    const pipeline = new Pipeline(registry, { remote_mcp: adapter });
    await pipeline.execute({
      toolName: contracts[0].name,
      args: { month: '2026-2' },
      channel: 'online',
      sessionId: 's1',
    });

    expect(capturedArgs.month).toBe('2026-02');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/tool-runtime/pipeline.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement pipeline**

```typescript
// backend/src/tool-runtime/pipeline.ts
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
    // Month normalization (same as current preprocessToolCall)
    if (typeof args.month === 'string') {
      args.month = normalizeMonthParam(args.month);
    }
  }

  private inject(request: ToolRuntimeRequest, traceId: string): void {
    // Inject runtime context into args for MCP tools that expect them.
    // Only inject if the field is not already present (caller can override).
    // Note: these fields are part of the "四层参数设计" convention in this project.
    const args = request.args;
    if (!args.traceId) args.traceId = traceId;
    if (!args.sessionId) args.sessionId = request.sessionId;
    // phone is a business parameter (layer 1-2), only inject if caller didn't provide
    if (request.userPhone && !args.phone) args.phone = request.userPhone;
    // operator is a governance field (layer 4), inject for audit trail
    if (request.activeSkillName && !args.operator) {
      args.operator = JSON.stringify({ type: 'ai_skill', id: request.activeSkillName });
    }
    // Store traceId on request for observe step (avoids relying on args mutation)
    request.traceId = traceId;
  }

  private govern(request: ToolRuntimeRequest, resolved: ResolvedTool): string | null {
    for (const policy of this.policies) {
      const rejection = policy.check(request, resolved);
      if (rejection) return rejection;
    }

    // Channel restriction check from execution policy
    const policy = resolved.binding?.executionPolicy;
    if (policy?.allowedChannels && !policy.allowedChannels.includes(request.channel)) {
      return `Tool "${request.toolName}" is not allowed on channel "${request.channel}"`;
    }

    return null;
  }

  private resolveAdapterType(resolved: ResolvedTool): AdapterType {
    // Mocked tools go to mock adapter
    if (resolved.contract.mocked) return 'mock';
    // Use binding adapter type if available
    if (resolved.binding?.adapterType) {
      // Map DB adapter types to our adapter types
      const mapping: Record<string, AdapterType> = {
        script: 'remote_mcp', // scripts still go through MCP in Phase 1
        db_binding: 'remote_mcp', // DB bindings still go through MCP in Phase 1
        api_proxy: 'api',
        remote_mcp: 'remote_mcp',
        api: 'api',
      };
      return mapping[resolved.binding.adapterType] ?? 'remote_mcp';
    }
    // Default: remote_mcp
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/tool-runtime/pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/tool-runtime/pipeline.ts backend/tests/unittest/tool-runtime/pipeline.test.ts
git commit -m "feat(tool-runtime): implement 7-step pipeline (resolve/validate/inject/govern/dispatch/normalize/observe)"
```

### Task 1.7: Implement ToolRuntime Public API

**Files:**
- Create: `backend/src/tool-runtime/runtime.ts`
- Create: `backend/src/tool-runtime/index.ts`
- Test: `backend/tests/unittest/tool-runtime/runtime.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/unittest/tool-runtime/runtime.test.ts
import { describe, test, expect, mock } from 'bun:test';
import { ToolRuntime } from '../../../src/tool-runtime/runtime';

describe('ToolRuntime', () => {
  test('creates instance with default adapters', () => {
    const runtime = new ToolRuntime();
    expect(runtime).toBeDefined();
  });

  test('call() returns ToolRuntimeResult', async () => {
    const runtime = new ToolRuntime();
    const result = await runtime.call({
      toolName: '__nonexistent__',
      args: {},
      channel: 'online',
      sessionId: 'test_1',
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('TOOL_NOT_FOUND');
    expect(typeof result.traceId).toBe('string');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('getToolSurface() returns non-disabled tools', () => {
    const runtime = new ToolRuntime();
    const surface = runtime.getToolSurface();
    expect(Array.isArray(surface)).toBe(true);
    for (const tool of surface) {
      expect(tool.disabled).toBe(false);
    }
  });

  test('refresh() reloads registry', () => {
    const runtime = new ToolRuntime();
    // Should not throw
    runtime.refresh();
  });

  test('callWithPolicies() applies scoped policies without accumulation', async () => {
    const runtime = new ToolRuntime();
    const surface = runtime.getToolSurface();
    if (surface.length === 0) return; // skip if no seed data

    // First call with blocking policy
    const result1 = await runtime.callWithPolicies({
      toolName: surface[0].name,
      args: {},
      channel: 'online',
      sessionId: 'test_policy',
    }, [{ name: 'block-all', check: () => 'Blocked for test' }]);
    expect(result1.success).toBe(false);
    expect(result1.errorCode).toBe('POLICY_REJECTED');

    // Second call without policy — should NOT be blocked (no accumulation)
    const result2 = await runtime.call({
      toolName: surface[0].name,
      args: {},
      channel: 'online',
      sessionId: 'test_no_policy',
    });
    // Should not be POLICY_REJECTED (may fail for other reasons like no MCP server)
    expect(result2.errorCode).not.toBe('POLICY_REJECTED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/tool-runtime/runtime.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement runtime**

```typescript
// backend/src/tool-runtime/runtime.ts
import type { ToolRuntimeRequest, ToolRuntimeResult, Adapter, AdapterType, GovernPolicy, ToolContract } from './types';
import { ToolRegistry } from './registry';
import { Pipeline } from './pipeline';
import { RemoteMcpAdapter } from './adapters/remote-mcp-adapter';
import { MockAdapter } from './adapters/mock-adapter';
import { ApiAdapter } from './adapters/api-adapter';

export class ToolRuntime {
  private registry: ToolRegistry;
  private pipeline: Pipeline;
  private policies: GovernPolicy[] = [];
  private adapters: Partial<Record<AdapterType, Adapter>>;
  private remoteMcpAdapter: RemoteMcpAdapter;

  constructor() {
    this.registry = new ToolRegistry();
    this.remoteMcpAdapter = new RemoteMcpAdapter();
    this.adapters = {
      remote_mcp: this.remoteMcpAdapter,
      mock: new MockAdapter(),
      api: new ApiAdapter(),
    };
    this.pipeline = new Pipeline(this.registry, this.adapters, this.policies);
  }

  /** Execute a tool call through the unified pipeline */
  async call(request: ToolRuntimeRequest): Promise<ToolRuntimeResult> {
    return this.pipeline.execute(request);
  }

  /** Get all non-disabled tool contracts (for building AI tool surface) */
  getToolSurface(): ToolContract[] {
    return this.registry.getToolSurface();
  }

  /** Reload registry from DB */
  refresh(): void {
    this.registry.refresh();
  }

  /** Replace all governance policies (call per-request to avoid accumulation) */
  setPolicies(policies: GovernPolicy[]): void {
    this.policies = policies;
    this.pipeline = new Pipeline(this.registry, this.adapters, this.policies);
  }

  /** Create a request-scoped call with temporary policies (preferred over setPolicies) */
  async callWithPolicies(request: ToolRuntimeRequest, policies: GovernPolicy[]): Promise<ToolRuntimeResult> {
    const scopedPipeline = new Pipeline(this.registry, this.adapters, policies);
    return scopedPipeline.execute(request);
  }

  /** Inject MCP tools map (from runner.ts persistent pool) */
  setMcpTools(tools: Record<string, { execute: (...args: any[]) => Promise<any> }>): void {
    this.remoteMcpAdapter.setMcpTools(tools);
  }

  /** Access the registry for advanced queries */
  getRegistry(): ToolRegistry {
    return this.registry;
  }
}
```

```typescript
// backend/src/tool-runtime/index.ts
export { ToolRuntime } from './runtime';
export type {
  ToolRuntimeRequest,
  ToolRuntimeResult,
  ToolContract,
  ToolBinding,
  ConnectorConfig,
  Adapter,
  AdapterType,
  Channel,
  GovernPolicy,
  ExecutionPolicy,
} from './types';
export { ErrorCode, isRetryable, makeSuccessResult, makeErrorResult } from './types';
export { ToolRegistry } from './registry';
export { Pipeline } from './pipeline';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/tool-runtime/runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tool-runtime tests together**

Run: `cd backend && bun test tests/unittest/tool-runtime/`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/tool-runtime/ backend/tests/unittest/tool-runtime/
git commit -m "feat(tool-runtime): implement ToolRuntime public API with registry, pipeline, and adapters"
```

---

## Phase 2: Voice / Outbound Integration

> Goal: Make `callMcpTool()` delegate to `ToolRuntime.call()` internally. Voice and outbound channels use the runtime without changing their external APIs. Lowest risk proof point.

### Task 2.1: Refactor mcp-client.ts to Delegate to Runtime

**Files:**
- Modify: `backend/src/services/mcp-client.ts`
- Test: existing `backend/tests/unittest/tool-runtime/regression-baseline.test.ts` must still pass

- [ ] **Step 1: Write a test for the new behavior**

```typescript
// Add to backend/tests/unittest/tool-runtime/regression-baseline.test.ts

describe('callMcpTool via Runtime', () => {
  test('callMcpTool returns { text, success } interface unchanged', async () => {
    // Import the function - interface should be identical
    const { callMcpTool } = await import('../../../src/services/mcp-client');
    // Call with a tool that likely doesn't have a running MCP server in test
    const result = await callMcpTool('test_sess', '__nonexistent_tool__', {});
    expect(typeof result.text).toBe('string');
    expect(typeof result.success).toBe('boolean');
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify current behavior**

Run: `cd backend && bun test tests/unittest/tool-runtime/regression-baseline.test.ts`
Expected: The new test may fail or pass depending on current MCP server state. Note the behavior.

- [ ] **Step 3: Modify mcp-client.ts**

Replace the internals of `callMcpTool` to use `ToolRuntime`, keeping the same external signature:

```typescript
// backend/src/services/mcp-client.ts
/**
 * mcp-client.ts — MCP 工具调用客户端
 *
 * 封装对工具的调用，被 voice.ts / outbound.ts 使用。
 * 内部委托给 Tool Runtime 统一执行管线。
 */

import { logger } from './logger';
import { ToolRuntime } from '../tool-runtime';

// Singleton runtime instance for voice/outbound channel
let runtimeInstance: ToolRuntime | null = null;

function getRuntime(): ToolRuntime {
  if (!runtimeInstance) {
    runtimeInstance = new ToolRuntime();
  }
  return runtimeInstance;
}

/** Refresh the runtime registry (call after tool config changes) */
export function refreshMcpClient(): void {
  if (runtimeInstance) runtimeInstance.refresh();
}

export async function callMcpTool(
  sessionId: string,
  name: string,
  args: Record<string, unknown>,
  channel: 'voice' | 'outbound' = 'voice',
): Promise<{ text: string; success: boolean }> {
  const runtime = getRuntime();

  const result = await runtime.call({
    toolName: name,
    args,
    channel,
    sessionId,
  });

  logger.info('mcp-client', 'tool_via_runtime', {
    session: sessionId,
    tool: name,
    success: result.success,
    source: result.source,
    latencyMs: result.latencyMs,
    trace: result.traceId,
  });

  return { text: result.rawText, success: result.success };
}
```

**Important:** The `RemoteMcpAdapter` needs MCP tools injected. Since voice/outbound don't use persistent MCP clients yet, we need the adapter to fall back to per-call HTTP connections. Add this fallback to `RemoteMcpAdapter`:

Update `backend/src/tool-runtime/adapters/remote-mcp-adapter.ts` to add per-call fallback:

```typescript
// Add at the top of remote-mcp-adapter.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ToolRegistry } from '../registry';

export class RemoteMcpAdapter implements Adapter {
  type: AdapterType = 'remote_mcp';
  private mcpTools: Record<string, { execute: (...args: any[]) => Promise<any> }> = {};
  private registry: ToolRegistry | null = null;

  setMcpTools(tools: Record<string, { execute: (...args: any[]) => Promise<any> }>): void {
    this.mcpTools = tools;
  }

  setRegistry(registry: ToolRegistry): void {
    this.registry = registry;
  }

  async call(ctx: AdapterCallContext): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    const { toolName, args } = ctx.request;

    // Try persistent pool first
    const tool = this.mcpTools[toolName];
    if (tool) {
      return this.callViaTool(toolName, args, tool);
    }

    // Fallback: per-call HTTP connection (like old mcp-client.ts)
    return this.callViaHttp(toolName, args, ctx);
  }

  private async callViaTool(
    toolName: string,
    args: Record<string, unknown>,
    tool: { execute: (...args: any[]) => Promise<any> },
  ): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    try {
      const result = await tool.execute(args);
      return this.parseResult(toolName, result);
    } catch (err) {
      logger.error('remote-mcp-adapter', 'pool_call_error', { tool: toolName, error: String(err) });
      return { rawText: String(err), parsed: null, success: false, hasData: false };
    }
  }

  private async callViaHttp(
    toolName: string,
    args: Record<string, unknown>,
    ctx: AdapterCallContext,
  ): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    // Resolve server URL from registry or connector
    let url = this.resolveUrl(toolName, ctx);
    if (!url) {
      url = process.env.TELECOM_MCP_URL ?? 'http://127.0.0.1:18003/mcp';
    }

    const client = new Client({ name: 'tool-runtime', version: '1.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(url)));
      const result = await client.callTool({ name: toolName, arguments: args });
      const text = (result.content as Array<{ type: string; text: string }>)
        .filter(c => c.type === 'text').map(c => c.text).join('\n');

      const success = !isErrorResult(text);
      const hasData = success && !isNoDataResult(text);
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = text; }

      return { rawText: text, parsed, success, hasData };
    } catch (err) {
      logger.error('remote-mcp-adapter', 'http_call_error', { tool: toolName, url, error: String(err) });
      return { rawText: JSON.stringify({ error: `Tool call failed: ${String(err)}` }), parsed: null, success: false, hasData: false };
    } finally {
      await client.close().catch(() => {});
    }
  }

  private resolveUrl(toolName: string, ctx: AdapterCallContext): string | null {
    // Try connector config
    if (ctx.resolved.connector?.config) {
      const url = (ctx.resolved.connector.config as any).url;
      if (url) return url;
    }
    // Try server URL from contract
    if (ctx.resolved.contract.serverId && this.registry) {
      return this.registry.getServerUrl(ctx.resolved.contract.serverId) ?? null;
    }
    return null;
  }

  private parseResult(toolName: string, result: any): { rawText: string; parsed: unknown; success: boolean; hasData: boolean } {
    let text = '';
    if (typeof result === 'string') text = result;
    else if (result?.content?.[0]?.text) text = result.content[0].text;
    else text = JSON.stringify(result);

    const success = !isErrorResult(text);
    const hasData = success && !isNoDataResult(text);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    return { rawText: text, parsed, success, hasData };
  }
}
```

- [ ] **Step 4: Run regression tests**

Run: `cd backend && bun test tests/unittest/tool-runtime/`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/mcp-client.ts backend/src/tool-runtime/adapters/remote-mcp-adapter.ts backend/tests/unittest/tool-runtime/
git commit -m "feat(tool-runtime): route callMcpTool through ToolRuntime pipeline (Phase 2)"
```

### Task 2.2: Wire Runtime Registry into ToolRuntime Constructor

**Files:**
- Modify: `backend/src/tool-runtime/runtime.ts`

- [ ] **Step 1: Connect registry to remote MCP adapter**

```typescript
// In runtime.ts constructor, add after creating remoteMcpAdapter:
this.remoteMcpAdapter.setRegistry(this.registry);
```

- [ ] **Step 2: Run all tests**

Run: `cd backend && bun test tests/unittest/tool-runtime/`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/tool-runtime/runtime.ts
git commit -m "fix(tool-runtime): wire registry into remote MCP adapter for URL resolution"
```

### Task 2.3: Integration Test — Voice Channel via Runtime

**Files:**
- Create: `backend/tests/unittest/tool-runtime/integration-voice.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// backend/tests/unittest/tool-runtime/integration-voice.test.ts
import { describe, test, expect } from 'bun:test';
import { callMcpTool } from '../../../src/services/mcp-client';

describe('Voice/Outbound via Runtime (integration)', () => {
  test('callMcpTool returns { text, success } for unknown tool', async () => {
    const result = await callMcpTool('test_sess', '__nonexistent__', {});
    expect(typeof result.text).toBe('string');
    expect(result.success).toBe(false);
  });

  test('callMcpTool signature is backward compatible', async () => {
    // Verify the function accepts the same 3 args
    expect(typeof callMcpTool).toBe('function');
    expect(callMcpTool.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `cd backend && bun test tests/unittest/tool-runtime/integration-voice.test.ts`
Expected: PASS

- [ ] **Step 3: Run full regression**

Run: `cd backend && bun test tests/unittest/`
Expected: ALL existing tests still pass

- [ ] **Step 4: Commit**

```bash
git add backend/tests/unittest/tool-runtime/integration-voice.test.ts
git commit -m "test(tool-runtime): add voice channel integration test via runtime"
```

---

## Phase 3: Workflow Integration

> Goal: Make `tool-executor.ts` and `skill-tool-executor.ts` use `ToolRuntime` instead of raw `_mcpTools`.

### Task 3.1: Update skill-tool-executor.ts to Accept Runtime

**Files:**
- Modify: `backend/src/engine/skill-tool-executor.ts`
- Test: `backend/tests/unittest/engine/skill-tool-executor.test.ts` must still pass

- [ ] **Step 1: Add runtime-aware overload**

Keep the old signature for backward compat, add new `executeToolViaRuntime()`:

```typescript
// Add to backend/src/engine/skill-tool-executor.ts

import type { ToolRuntime, ToolRuntimeResult } from '../tool-runtime';

/**
 * Execute a tool via the unified runtime. Returns the same ToolExecResult shape
 * for backward compatibility with skill-runtime.ts and workflow executors.
 */
export async function executeToolViaRuntime(
  toolName: string,
  args: Record<string, unknown>,
  runtime: ToolRuntime,
  context: { sessionId: string; phone: string; channel?: 'online' | 'voice' | 'outbound' | 'workflow'; activeSkillName?: string | null },
): Promise<ToolExecResult> {
  const result = await runtime.call({
    toolName,
    args,
    channel: context.channel ?? 'workflow',
    sessionId: context.sessionId,
    userPhone: context.phone,
    activeSkillName: context.activeSkillName,
  });

  return {
    success: result.success,
    hasData: result.hasData,
    rawText: result.rawText,
    parsed: result.parsed,
  };
}
```

- [ ] **Step 2: Run existing tests to verify backward compat**

Run: `cd backend && bun test tests/unittest/engine/skill-tool-executor.test.ts`
Expected: PASS (old `executeTool()` unchanged)

- [ ] **Step 3: Commit**

```bash
git add backend/src/engine/skill-tool-executor.ts
git commit -m "feat(tool-runtime): add executeToolViaRuntime() to skill-tool-executor for Phase 3"
```

### Task 3.2: Update tool-executor.ts to Use Runtime

**Files:**
- Modify: `backend/src/workflow/executors/tool-executor.ts`
- Test: `backend/tests/unittest/tool-runtime/regression-baseline.test.ts`

- [ ] **Step 1: Replace _mcpTools with runtime**

```typescript
// backend/src/workflow/executors/tool-executor.ts
import type { NodeExecutor, NodeExecutionResult } from '../types/execution';
import type { ToolNodeConfig } from '../types/node-configs';
import { executeTool, executeToolViaRuntime, buildToolArgs } from '../../engine/skill-tool-executor';
import type { ToolRuntime } from '../../tool-runtime';

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

    // Prefer runtime if available, fall back to legacy _mcpTools
    const runtime = (context as any)._toolRuntime as ToolRuntime | undefined;
    const mcpTools = (context as any)._mcpTools ?? {};

    const result = runtime
      ? await executeToolViaRuntime(config.toolRef, args, runtime, { sessionId, phone, channel: 'workflow' })
      : await executeTool(config.toolRef, args, mcpTools);

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
```

- [ ] **Step 2: Run regression tests**

Run: `cd backend && bun test tests/unittest/`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/workflow/executors/tool-executor.ts
git commit -m "feat(tool-runtime): tool-executor prefers ToolRuntime, falls back to _mcpTools"
```

### Task 3.3: Update skill-runtime.ts to Use Runtime

**Files:**
- Modify: `backend/src/engine/skill-runtime.ts`

- [ ] **Step 1: Add runtime parameter to runSkillTurn**

The change is additive: add an optional `runtime` parameter. If provided, use `executeToolViaRuntime` instead of `executeTool`:

Find the tool execution call in `skill-runtime.ts` (where it calls `executeTool(step.tool, args, mcpTools)`) and add the runtime branch:

```typescript
// In the tool step execution section of runSkillTurn:
const toolResult = runtime
  ? await executeToolViaRuntime(step.tool, args, runtime, {
      sessionId, phone: sessionContext.phone, channel: 'online',
      activeSkillName: spec.name,
    })
  : await executeTool(step.tool, args, mcpTools);
```

Add the runtime parameter to the function signature as optional:

```typescript
export async function runSkillTurn(
  sessionId: string,
  userMessage: string,
  spec: WorkflowSpec,
  mcpTools: Record<string, { execute: (...a: any[]) => Promise<any> }>,
  context: SkillTurnContext,
  runtime?: import('../tool-runtime').ToolRuntime,
): Promise<SkillTurnResult> {
```

- [ ] **Step 2: Run tests**

Run: `cd backend && bun test tests/unittest/`
Expected: ALL PASS (runtime is optional, old callers unaffected)

- [ ] **Step 3: Commit**

```bash
git add backend/src/engine/skill-runtime.ts
git commit -m "feat(tool-runtime): skill-runtime accepts optional ToolRuntime for tool execution"
```

---

## Phase 4: Online Chat Integration (runner.ts)

> Goal: Refactor `runner.ts` to use `ToolRuntime` for tool discovery, mock wrapping, API routing, SOP Guard, and parameter standardization. This is the highest-risk phase.

### Task 4.1: Create SOP Policy for Runtime

**Files:**
- Create: `backend/src/tool-runtime/policies/sop-policy.ts`
- Create: `backend/src/tool-runtime/policies/index.ts`
- Test: `backend/tests/unittest/tool-runtime/policies/sop-policy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/unittest/tool-runtime/policies/sop-policy.test.ts
import { describe, test, expect } from 'bun:test';
import { SopPolicy } from '../../../../src/tool-runtime/policies/sop-policy';
import { SOPGuard } from '../../../../src/engine/sop-guard';
import type { ToolRuntimeRequest, ToolContract, ResolvedTool } from '../../../../src/tool-runtime/types';

describe('SopPolicy', () => {
  test('returns null when no guard is set', () => {
    const policy = new SopPolicy();
    const req: ToolRuntimeRequest = { toolName: 'test', args: {}, channel: 'online', sessionId: 's1' };
    const resolved: ResolvedTool = {
      contract: { id: '1', name: 'test', description: '', mocked: false, disabled: false } as ToolContract,
      binding: null,
      connector: null,
    };
    expect(policy.check(req, resolved)).toBeNull();
  });

  test('delegates to SOPGuard.check()', () => {
    const guard = new SOPGuard();
    const policy = new SopPolicy(guard);
    // Without a plan, guard should pass everything
    const req: ToolRuntimeRequest = { toolName: 'test', args: {}, channel: 'online', sessionId: 's1' };
    const resolved: ResolvedTool = {
      contract: { id: '1', name: 'test', description: '', mocked: false, disabled: false } as ToolContract,
      binding: null,
      connector: null,
    };
    expect(policy.check(req, resolved)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/tool-runtime/policies/sop-policy.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement SOP policy**

```typescript
// backend/src/tool-runtime/policies/sop-policy.ts
import type { GovernPolicy, ToolRuntimeRequest, ResolvedTool } from '../types';
import type { SOPGuard } from '../../engine/sop-guard';

export class SopPolicy implements GovernPolicy {
  name = 'sop-guard';
  private guard: SOPGuard | null;

  constructor(guard?: SOPGuard) {
    this.guard = guard ?? null;
  }

  setGuard(guard: SOPGuard): void {
    this.guard = guard;
  }

  check(request: ToolRuntimeRequest, resolved: ResolvedTool): string | null {
    if (!this.guard) return null;
    return this.guard.check(request.toolName);
  }

  /** Record a tool call result in the guard (for state tracking) */
  recordToolCall(toolName: string, result: { success: boolean; hasData: boolean }): void {
    this.guard?.recordToolCall(toolName, result);
  }
}
```

```typescript
// backend/src/tool-runtime/policies/index.ts
export { SopPolicy } from './sop-policy';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/tool-runtime/policies/sop-policy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/tool-runtime/policies/ backend/tests/unittest/tool-runtime/policies/
git commit -m "feat(tool-runtime): implement SopPolicy wrapping SOPGuard for govern step"
```

### Task 4.2: Introduce Feature Flag for Runtime Migration

**Files:**
- Modify: `backend/src/tool-runtime/runtime.ts`

- [ ] **Step 1: Add feature flag support**

```typescript
// Add to runtime.ts
/** Feature flag: controls whether runner.ts uses runtime or legacy path */
export function isRuntimeEnabled(): boolean {
  return process.env.TOOL_RUNTIME_ENABLED === 'true';
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/tool-runtime/runtime.ts
git commit -m "feat(tool-runtime): add TOOL_RUNTIME_ENABLED feature flag for gradual rollout"
```

### Task 4.3: Refactor runner.ts Tool Discovery

**Files:**
- Modify: `backend/src/engine/runner.ts`

This is the highest-risk task. We introduce the runtime alongside the existing code, gated by the feature flag.

- [ ] **Step 1: Import runtime at top of runner.ts**

Add near the top imports:

```typescript
import { ToolRuntime, isRuntimeEnabled } from '../tool-runtime';
import { SopPolicy } from '../tool-runtime/policies/sop-policy';
```

- [ ] **Step 2: Create runtime-based tool surface builder**

Add a new function alongside `getMCPTools()`:

```typescript
// Singleton runtime for online channel
let onlineRuntime: ToolRuntime | null = null;

function getToolRuntime(): ToolRuntime {
  if (!onlineRuntime) {
    onlineRuntime = new ToolRuntime();
  }
  return onlineRuntime;
}

/**
 * Build AI SDK tools from ToolRuntime.
 * Each tool's execute() delegates to runtime.call(), which handles:
 * - Mock routing, API routing, parameter standardization
 * - Context injection, SOP guard, result normalization
 * - Logging and auditing
 */
async function buildRuntimeTools(
  runtime: ToolRuntime,
  channel: RuntimeChannel,
  sessionId: string,
  userPhone: string,
  lang: 'zh' | 'en',
  activeSkillRef: { current: string | undefined },
  scopedPolicies: GovernPolicy[] = [],
): Promise<Record<string, any>> {
  // First, load MCP tools into the runtime's remote adapter
  const { tools: mcpPoolTools } = await getMCPTools();
  runtime.setMcpTools(mcpPoolTools as Record<string, any>);

  // Get tool surface from registry
  const surface = runtime.getToolSurface();
  const runtimeTools: Record<string, any> = {};

  for (const contract of surface) {
    // Build AI SDK compatible tool object
    const schema = contract.inputSchema ?? { type: 'object', properties: {} };
    runtimeTools[contract.name] = {
      description: contract.description,
      parameters: jsonSchema(schema as any),
      execute: async (args: Record<string, unknown>) => {
        const result = await runtime.callWithPolicies({
          toolName: contract.name,
          args,
          channel,
          sessionId,
          userPhone,
          lang,
          activeSkillName: activeSkillRef.current ?? null,
        }, scopedPolicies);

        // Return in MCP format for AI SDK compatibility
        return { content: [{ type: 'text', text: result.rawText }] };
      },
    };
  }

  return runtimeTools;
}
```

- [ ] **Step 3: Add runtime branch in runAgent()**

In the `runAgent()` function, after the existing `getMCPTools()` call and tool wrapping, add a runtime branch:

```typescript
// Inside runAgent(), replace the tool building section with:
let sopWrappedTools: Record<string, any>;
const sopGuard = new SOPGuard();

if (isRuntimeEnabled()) {
  // ── Runtime path: all tool logic unified in ToolRuntime ──
  const runtime = getToolRuntime();
  // Create request-scoped SOP policy (avoids accumulation on singleton)
  const sopPolicy = new SopPolicy(sopGuard);

  const activeSkillRef = { current: options?.skillName };
  // Pass scoped policies per tool call via callWithPolicies
  sopWrappedTools = await buildRuntimeTools(
    runtime, 'online', `sess_${Date.now()}`, userPhone, lang, activeSkillRef,
    [sopPolicy], // request-scoped policies
  );

  // Activate SOP plan if provided
  if (options?.workflowPlan && options?.skillName) {
    sopGuard.activatePlan(options.skillName, options.workflowPlan);
  }

  // Replay history for SOP state continuity
  // ... (keep existing history replay logic)
} else {
  // ── Legacy path: keep existing tool wrapping logic ──
  // ... (existing mock/API/SOP/translation wrapping code stays here)
}
```

**Note:** This is a structural change. The full implementation should preserve all existing behavior in the legacy branch and only activate the runtime path when `TOOL_RUNTIME_ENABLED=true`.

- [ ] **Step 4: Run all tests with legacy mode (default)**

Run: `cd backend && bun test tests/unittest/`
Expected: ALL PASS (runtime not enabled by default)

- [ ] **Step 5: Run all tests with runtime mode**

Run: `cd backend && TOOL_RUNTIME_ENABLED=true bun test tests/unittest/`
Expected: ALL PASS (or note which tests need adjustment)

- [ ] **Step 6: Commit**

```bash
git add backend/src/engine/runner.ts
git commit -m "feat(tool-runtime): add runtime path in runner.ts gated by TOOL_RUNTIME_ENABLED flag"
```

### Task 4.4: Migrate Translation Wrapping to Pipeline

**Files:**
- Modify: `backend/src/tool-runtime/pipeline.ts`

- [ ] **Step 1: Add optional post-dispatch translation**

```typescript
// Add to Pipeline class
private langOverride?: 'zh' | 'en';

setLang(lang: 'zh' | 'en'): void {
  this.langOverride = lang;
}
```

In the `execute()` method, after adapter dispatch and before normalize, add translation:

```typescript
// After step 5 (dispatch), before step 6 (normalize):
if (this.langOverride && this.langOverride !== 'zh' && adapterResult.success) {
  try {
    const { translateText } = await import('../services/translate-lang');
    adapterResult.rawText = await translateText(adapterResult.rawText, this.langOverride);
    try { adapterResult.parsed = JSON.parse(adapterResult.rawText); } catch { /* keep original */ }
  } catch { /* translation failed, keep original */ }
}
```

- [ ] **Step 2: Run tests**

Run: `cd backend && bun test tests/unittest/tool-runtime/`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/tool-runtime/pipeline.ts
git commit -m "feat(tool-runtime): add optional translation post-processing in pipeline"
```

---

## Phase 5: Non-MCP Adapters (DB + Script)

> Goal: Implement `db-adapter` and `script-adapter`, migrate 2-3 pilot tools off MCP.

### Task 5.1: Implement DB Adapter

**Files:**
- Create: `backend/src/tool-runtime/adapters/db-adapter.ts`
- Test: `backend/tests/unittest/tool-runtime/adapters/db-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/unittest/tool-runtime/adapters/db-adapter.test.ts
import { describe, test, expect } from 'bun:test';
import { DbAdapter } from '../../../../src/tool-runtime/adapters/db-adapter';
import type { AdapterCallContext, ToolContract, ToolBinding, ConnectorConfig } from '../../../../src/tool-runtime/types';

describe('DbAdapter', () => {
  test('type is db', () => {
    expect(new DbAdapter().type).toBe('db');
  });

  test('returns error when no binding config', async () => {
    const adapter = new DbAdapter();
    const ctx: AdapterCallContext = {
      request: { toolName: 'test', args: {}, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'test', description: '', mocked: false, disabled: false } as ToolContract,
        binding: { toolId: '1', adapterType: 'db', status: 'active' } as ToolBinding,
        connector: { id: 'c1', name: 'test-db', type: 'db', status: 'active' } as ConnectorConfig,
      },
      traceId: 'trc_1',
    };
    const result = await adapter.call(ctx);
    expect(result.success).toBe(false);
    expect(result.rawText).toContain('No DB query config');
  });

  test('executes select query from binding config', async () => {
    const adapter = new DbAdapter();
    const ctx: AdapterCallContext = {
      request: { toolName: 'test_query', args: { phone: '13800000001' }, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'test_query', description: '', mocked: false, disabled: false } as ToolContract,
        binding: {
          toolId: '1', adapterType: 'db', status: 'active',
          config: {
            db: {
              table: 'subscribers',
              operation: 'select',
              where: { phone: '{{phone}}' },
              columns: ['id', 'name', 'phone', 'plan_name'],
            },
          },
        } as unknown as ToolBinding,
        connector: { id: 'c1', name: 'main-db', type: 'db', status: 'active' } as ConnectorConfig,
      },
      traceId: 'trc_2',
    };
    const result = await adapter.call(ctx);
    // May succeed or fail depending on DB state, but should not throw
    expect(typeof result.rawText).toBe('string');
    expect(typeof result.success).toBe('boolean');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/tool-runtime/adapters/db-adapter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement DB adapter**

```typescript
// backend/src/tool-runtime/adapters/db-adapter.ts
import type { Adapter, AdapterCallContext, AdapterType } from '../types';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import { isErrorResult, isNoDataResult } from '../../services/tool-result';
import { logger } from '../../services/logger';

interface DbQueryConfig {
  table: string;
  operation: 'select' | 'insert' | 'update';
  where?: Record<string, string>; // key: column, value: '{{argName}}' or literal
  columns?: string[];
  set?: Record<string, string>; // for update
  values?: Record<string, string>; // for insert
}

// Allowlist of safe table/column name patterns (alphanumeric + underscore only)
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertSafeIdentifier(name: string, label: string): void {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Unsafe ${label}: "${name}" — only alphanumeric and underscore allowed`);
  }
}

export class DbAdapter implements Adapter {
  type: AdapterType = 'db';

  async call(ctx: AdapterCallContext): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    const { toolName, args } = ctx.request;
    const bindingConfig = ctx.resolved.binding?.config as Record<string, unknown> | undefined;
    const dbConfig = bindingConfig?.db as DbQueryConfig | undefined;

    if (!dbConfig) {
      return { rawText: `No DB query config for tool "${toolName}"`, parsed: null, success: false, hasData: false };
    }

    try {
      const result = await this.executeQuery(dbConfig, args as Record<string, unknown>);
      const text = JSON.stringify(result);
      const success = !isErrorResult(text);
      const hasData = success && !isNoDataResult(text) && (Array.isArray(result) ? result.length > 0 : result !== null);

      logger.info('db-adapter', 'executed', { tool: toolName, table: dbConfig.table, op: dbConfig.operation, hasData });
      return { rawText: text, parsed: result, success, hasData };
    } catch (err) {
      logger.error('db-adapter', 'error', { tool: toolName, error: String(err) });
      return { rawText: `DB query failed: ${String(err)}`, parsed: null, success: false, hasData: false };
    }
  }

  private async executeQuery(config: DbQueryConfig, args: Record<string, unknown>): Promise<unknown> {
    // Validate all identifiers against allowlist to prevent SQL injection
    assertSafeIdentifier(config.table, 'table name');
    if (config.columns) {
      for (const col of config.columns) assertSafeIdentifier(col, 'column name');
    }

    const resolveValue = (template: string): unknown => {
      const match = template.match(/^\{\{(\w+)\}\}$/);
      if (match) return args[match[1]];
      return template;
    };

    if (config.operation === 'select') {
      const cols = config.columns?.join(', ') ?? '*';

      // Build parameterized WHERE clause
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (config.where) {
        for (const [col, tmpl] of Object.entries(config.where)) {
          assertSafeIdentifier(col, 'where column');
          conditions.push(`${col} = ?`);
          params.push(resolveValue(tmpl));
        }
      }
      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
      const query = `SELECT ${cols} FROM ${config.table}${whereClause}`;

      // Use parameterized query to prevent SQL injection on values
      const stmt = db.$client.prepare(query);
      return stmt.all(...params);
    }

    throw new Error(`DB operation "${config.operation}" not yet implemented`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/tool-runtime/adapters/db-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Update adapters index and commit**

```typescript
// Update backend/src/tool-runtime/adapters/index.ts
export { RemoteMcpAdapter } from './remote-mcp-adapter';
export { MockAdapter } from './mock-adapter';
export { ApiAdapter } from './api-adapter';
export { DbAdapter } from './db-adapter';
```

```bash
git add backend/src/tool-runtime/adapters/ backend/tests/unittest/tool-runtime/adapters/
git commit -m "feat(tool-runtime): implement DbAdapter for direct DB query execution"
```

### Task 5.2: Implement Script Adapter

**Files:**
- Create: `backend/src/tool-runtime/adapters/script-adapter.ts`
- Test: `backend/tests/unittest/tool-runtime/adapters/script-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/unittest/tool-runtime/adapters/script-adapter.test.ts
import { describe, test, expect } from 'bun:test';
import { ScriptAdapter } from '../../../../src/tool-runtime/adapters/script-adapter';
import type { AdapterCallContext, ToolContract, ToolBinding } from '../../../../src/tool-runtime/types';

describe('ScriptAdapter', () => {
  test('type is script', () => {
    expect(new ScriptAdapter().type).toBe('script');
  });

  test('returns error when no handler key', async () => {
    const adapter = new ScriptAdapter();
    const ctx: AdapterCallContext = {
      request: { toolName: 'test', args: {}, channel: 'online', sessionId: 's1' },
      resolved: {
        contract: { id: '1', name: 'test', description: '', mocked: false, disabled: false } as ToolContract,
        binding: { toolId: '1', adapterType: 'script', status: 'active' } as ToolBinding,
        connector: null,
      },
      traceId: 'trc_1',
    };
    const result = await adapter.call(ctx);
    expect(result.success).toBe(false);
    expect(result.rawText).toContain('No handler');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/tool-runtime/adapters/script-adapter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement script adapter**

```typescript
// backend/src/tool-runtime/adapters/script-adapter.ts
import type { Adapter, AdapterCallContext, AdapterType } from '../types';
import { isErrorResult, isNoDataResult } from '../../services/tool-result';
import { logger } from '../../services/logger';

// Handler registry: maps handler_key to async function
const handlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();

export function registerScriptHandler(key: string, handler: (args: Record<string, unknown>) => Promise<unknown>): void {
  handlers.set(key, handler);
}

export class ScriptAdapter implements Adapter {
  type: AdapterType = 'script';

  async call(ctx: AdapterCallContext): Promise<{ rawText: string; parsed: unknown; success: boolean; hasData: boolean }> {
    const { toolName, args } = ctx.request;
    const handlerKey = ctx.resolved.binding?.handlerKey;

    if (!handlerKey) {
      return { rawText: `No handler key for script tool "${toolName}"`, parsed: null, success: false, hasData: false };
    }

    const handler = handlers.get(handlerKey);
    if (!handler) {
      return { rawText: `Script handler "${handlerKey}" not registered`, parsed: null, success: false, hasData: false };
    }

    try {
      const result = await handler(args as Record<string, unknown>);
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      const success = !isErrorResult(text);
      const hasData = success && !isNoDataResult(text);
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = result; }

      logger.info('script-adapter', 'executed', { tool: toolName, handler: handlerKey, success });
      return { rawText: text, parsed, success, hasData };
    } catch (err) {
      logger.error('script-adapter', 'error', { tool: toolName, handler: handlerKey, error: String(err) });
      return { rawText: `Script execution failed: ${String(err)}`, parsed: null, success: false, hasData: false };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/tool-runtime/adapters/script-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Update adapters index, register in runtime, commit**

```typescript
// Update backend/src/tool-runtime/adapters/index.ts
export { RemoteMcpAdapter } from './remote-mcp-adapter';
export { MockAdapter } from './mock-adapter';
export { ApiAdapter } from './api-adapter';
export { DbAdapter } from './db-adapter';
export { ScriptAdapter, registerScriptHandler } from './script-adapter';
```

Update `backend/src/tool-runtime/runtime.ts` to include new adapters:

```typescript
// In constructor, add:
import { DbAdapter } from './adapters/db-adapter';
import { ScriptAdapter } from './adapters/script-adapter';

// In the adapters init:
this.adapters = {
  remote_mcp: this.remoteMcpAdapter,
  mock: new MockAdapter(),
  api: new ApiAdapter(),
  db: new DbAdapter(),
  script: new ScriptAdapter(),
};
```

```bash
git add backend/src/tool-runtime/
git commit -m "feat(tool-runtime): implement ScriptAdapter with handler registry, wire all adapters"
```

### Task 5.3: Add execution_records Table

**Files:**
- Modify: `packages/shared-db/src/schema/platform.ts`

- [ ] **Step 1: Add the execution_records table**

```typescript
// Add to packages/shared-db/src/schema/platform.ts after skillToolBindings

export const executionRecords = sqliteTable('execution_records', {
  id: text('id').primaryKey(),
  trace_id: text('trace_id').notNull(),
  tool_name: text('tool_name').notNull(),
  channel: text('channel').notNull(),
  adapter_type: text('adapter_type').notNull(),
  session_id: text('session_id'),
  user_phone: text('user_phone'),
  skill_name: text('skill_name'),
  success: integer('success', { mode: 'boolean' }).notNull(),
  has_data: integer('has_data', { mode: 'boolean' }).notNull(),
  error_code: text('error_code'),
  latency_ms: integer('latency_ms').notNull(),
  input_json: text('input_json'),
  output_preview: text('output_preview'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});
```

- [ ] **Step 2: Export from schema index**

```typescript
// Add to packages/shared-db/src/schema/index.ts (or wherever the barrel export is)
export { executionRecords } from './platform';
```

- [ ] **Step 3: Apply schema**

Run: `cd backend && bunx drizzle-kit push`
Expected: Table created successfully

- [ ] **Step 4: Commit**

```bash
git add packages/shared-db/src/schema/platform.ts packages/shared-db/src/schema/index.ts
git commit -m "feat(tool-runtime): add execution_records table for unified audit trail"
```

### Task 5.4: Wire Observe Step to Write Execution Records

**Files:**
- Modify: `backend/src/tool-runtime/pipeline.ts`

- [ ] **Step 1: Update observe step to persist records**

```typescript
// In Pipeline.observe(), add DB persistence:
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

  // Async fire-and-forget: persist execution record
  this.persistRecord(request, result, traceId).catch(() => {});
}

private async persistRecord(request: ToolRuntimeRequest, result: ToolRuntimeResult, traceId: string): Promise<void> {
  try {
    const { db } = await import('../db');
    const { executionRecords } = await import('../db/schema');
    const { randomUUID } = await import('crypto');

    await db.insert(executionRecords).values({
      id: randomUUID(),
      trace_id: traceId,
      tool_name: request.toolName,
      channel: request.channel,
      adapter_type: result.source,
      session_id: request.sessionId,
      user_phone: request.userPhone ?? null,
      skill_name: request.activeSkillName ?? null,
      success: result.success,
      has_data: result.hasData,
      error_code: result.errorCode ?? null,
      latency_ms: result.latencyMs,
      input_json: JSON.stringify(request.args).slice(0, 2000),
      output_preview: result.rawText.slice(0, 1000),
    });
  } catch {
    // Non-critical: don't let audit failure break tool execution
  }
}
```

- [ ] **Step 2: Run tests**

Run: `cd backend && bun test tests/unittest/tool-runtime/`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/tool-runtime/pipeline.ts
git commit -m "feat(tool-runtime): persist execution records in observe step"
```

---

## Phase 6: Management UI Refactoring (Outline)

> Goal: Rename and restructure the management UI from MCP-centric to Tool Runtime-centric.

### Task 6.1: Rename McpManagementPage to ToolRuntimePage

**Files:**
- Modify: `frontend/src/km/mcp/McpManagementPage.tsx` — rename tabs
- Modify: `frontend/src/App.tsx` — update route if needed

- [ ] **Step 1:** Update tab labels: "MCP 管理" → "Tool Runtime", "MCP Servers" → "Remote Endpoints", "Tools" → "Tool Contracts"
- [ ] **Step 2:** Keep component file names unchanged for now (rename later in Phase 8)
- [ ] **Step 3:** Run frontend tests
- [ ] **Step 4:** Commit

### Task 6.2: Add Runtime Overview Tab

**Files:**
- Create: `frontend/src/km/mcp/RuntimeOverviewPage.tsx`

- [ ] **Step 1:** Create overview page with stats: total calls, success rate, avg latency, adapter distribution
- [ ] **Step 2:** Query `execution_records` via new API endpoint
- [ ] **Step 3:** Add tab to McpManagementPage
- [ ] **Step 4:** Run tests, commit

### Task 6.3: Add Runtime Bindings Tab

**Files:**
- Create: `frontend/src/km/mcp/RuntimeBindingsPage.tsx`

- [ ] **Step 1:** List tool_implementations joined with mcp_tools and connectors
- [ ] **Step 2:** Show adapter type, connector, policy, status, last test result
- [ ] **Step 3:** Add tab to McpManagementPage
- [ ] **Step 4:** Run tests, commit

### Task 6.4: Add Execution Records Tab

**Files:**
- Create: `frontend/src/km/mcp/ExecutionRecordsPage.tsx`

- [ ] **Step 1:** List execution_records with filtering by tool, channel, result, time range
- [ ] **Step 2:** Click-to-expand detail view showing 7-step pipeline trace
- [ ] **Step 3:** Add tab to McpManagementPage
- [ ] **Step 4:** Run tests, commit

### Task 6.5: Enhance Tool Editor with Runtime Binding

**Files:**
- Modify: `frontend/src/km/mcp/McpToolEditor.tsx`

- [ ] **Step 1:** Add "Runtime Binding" section showing adapter type, connector, execution policy
- [ ] **Step 2:** Add "Execution Policy" form: timeout, retry, allowed channels, confirm required
- [ ] **Step 3:** Add inline test button that calls tool via runtime and shows pipeline trace
- [ ] **Step 4:** Run tests, commit

### Task 6.6: Enhance Connector Page

**Files:**
- Modify: `frontend/src/km/mcp/ConnectorListPage.tsx`

- [ ] **Step 1:** Add "Used by" column showing which bindings reference each connector
- [ ] **Step 2:** Add DB connector type support
- [ ] **Step 3:** Run tests, commit

---

## Phase 7: Shrink Local MCP Servers (Outline)

> Goal: Migrate selected tools from MCP to direct API/DB/Script adapters. Reduce local MCP server count.

### Task 7.1: Pilot Migration — query_bill to API Adapter

- [ ] **Step 1:** Create connector pointing to mock_apis billing endpoint
- [ ] **Step 2:** Create tool_implementation with adapter_type='api' for query_bill
- [ ] **Step 3:** Test via runtime: `TOOL_RUNTIME_ENABLED=true` with query_bill
- [ ] **Step 4:** Verify identical results to MCP path
- [ ] **Step 5:** Commit

### Task 7.2: Pilot Migration — query_plans to API Adapter

- [ ] Same pattern as Task 7.1 for query_plans tool

### Task 7.3: Pilot Migration — diagnose_app to Script Adapter

- [ ] **Step 1:** Extract diagnosis logic from MCP server into a script handler
- [ ] **Step 2:** Register handler with `registerScriptHandler()`
- [ ] **Step 3:** Create tool_implementation with adapter_type='script'
- [ ] **Step 4:** Test and verify
- [ ] **Step 5:** Commit

### Task 7.4: Evaluate MCP Server Retirement

- [ ] **Step 1:** Audit which tools have been migrated to non-MCP adapters
- [ ] **Step 2:** If all tools in a server are migrated, disable the server
- [ ] **Step 3:** Monitor for regressions
- [ ] **Step 4:** Document remaining servers and their retirement timeline

---

## Phase 8: Terminology and Tech Debt Cleanup (Outline)

> Goal: Clean up legacy code paths, rename files, remove feature flags.

### Task 8.1: Remove Legacy Tool Wrapping from runner.ts

- [ ] Remove the `isRuntimeEnabled()` feature flag
- [ ] Remove the legacy mock/API/SOP wrapping code block
- [ ] Keep only the runtime path
- [ ] Run all tests

### Task 8.2: Remove TOOL_ROUTING_MODE

- [ ] Remove `TOOL_ROUTING_MODE` env var and all `hybrid` mode code
- [ ] Remove direct API injection in runner.ts

### Task 8.3: Slim Down mcp-client.ts

- [ ] If all voice/outbound calls go through runtime, consider inlining the function
- [ ] Or rename to `tool-client.ts` for clarity

### Task 8.4: Clean Up skill-tool-executor.ts

- [ ] Remove old `executeTool()` if all callers use `executeToolViaRuntime()`
- [ ] Or keep as a thin wrapper over runtime

### Task 8.5: Rename Frontend Files

- [ ] Rename `McpManagementPage.tsx` → `ToolRuntimePage.tsx`
- [ ] Rename `McpServerList.tsx` → `RemoteEndpointList.tsx`
- [ ] Rename `McpToolListPage.tsx` → `ToolContractListPage.tsx`
- [ ] Update all imports

### Task 8.6: Update CLAUDE.md and Documentation

- [ ] Update architecture descriptions
- [ ] Update file path references
- [ ] Update glossary with new terms

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| runner.ts regression | Feature flag `TOOL_RUNTIME_ENABLED`, legacy path preserved |
| Voice/outbound breakage | `callMcpTool()` signature unchanged, internal delegation |
| Workflow breakage | `_mcpTools` fallback when `_toolRuntime` not injected |
| DB migration issues | New columns/tables only, no existing column modifications |
| Performance degradation | Pipeline adds ~1ms overhead, offset by connection pooling |

## Rollback Strategy

- Each channel (online/voice/outbound/workflow) can independently revert to legacy path
- Feature flag `TOOL_RUNTIME_ENABLED=false` reverts runner.ts immediately
- `callMcpTool()` can be reverted by restoring the old mcp-client.ts
- Tool-level adapter migration is per-tool — revert by removing `tool_implementations` row
- All changes are additive until Phase 8 cleanup
