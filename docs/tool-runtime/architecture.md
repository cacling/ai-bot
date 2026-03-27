# Tool Runtime Architecture

> Unified tool execution kernel for all channels (online/voice/outbound/workflow).

## Overview

The Tool Runtime replaces scattered tool calling in `runner.ts`, `mcp-client.ts`, `tool-executor.ts`, and `skill-tool-executor.ts` with a single 7-step pipeline.

## Pipeline

```
request → resolve → validate → inject → govern → dispatch → normalize → observe → result
```

| Step | Responsibility |
|------|---------------|
| **resolve** | Look up tool contract + binding + connector from registry |
| **validate** | Parameter normalization (e.g., month format `2026-2` → `2026-02`) |
| **inject** | Add runtime context: traceId, sessionId, phone, operator |
| **govern** | Policy checks: SOP Guard, channel restrictions, execution policy |
| **dispatch** | Route to adapter: remote_mcp / mock / api / db / script |
| **normalize** | Convert adapter result to `ToolRuntimeResult` |
| **observe** | Log + persist to `execution_records` table |

## Adapters

| Adapter | Backend | When Used |
|---------|---------|-----------|
| `remote_mcp` | MCP Server pool or per-call HTTP | Default for all tools (Phase 1) |
| `mock` | `mock-engine.ts` rules | Tools with `mocked: true` |
| `api` | `api-executor.ts` | Tools with `api_proxy` binding |
| `db` | Parameterized SQL via Drizzle | Tools with `db` binding (future) |
| `script` | Handler registry | Tools with `script` binding (future) |

## Key Types

```typescript
interface ToolRuntimeRequest {
  toolName: string;
  args: Record<string, unknown>;
  channel: 'online' | 'voice' | 'outbound' | 'workflow';
  sessionId: string;
  userPhone?: string;
  lang?: 'zh' | 'en';
  activeSkillName?: string | null;
}

interface ToolRuntimeResult {
  success: boolean;
  hasData: boolean;
  rawText: string;
  parsed: unknown;
  source: AdapterType;
  errorCode?: ErrorCode;
  latencyMs: number;
  traceId: string;
}
```

## Integration Points

| Channel | Entry Point | How It Uses Runtime |
|---------|-------------|-------------------|
| **Online** | `runner.ts` | Feature-flagged (`TOOL_RUNTIME_ENABLED`), builds AI SDK tools from registry |
| **Voice** | `mcp-client.ts` → `callMcpTool()` | Always delegates to `ToolRuntime.call()` |
| **Outbound** | Same as voice | Same path |
| **Workflow** | `tool-executor.ts` | Prefers `_toolRuntime` if injected, falls back to `_mcpTools` |
| **Skill Runtime** | `skill-runtime.ts` | Optional `runtime` parameter in `runSkillTurn()` |

## Database Tables

| Table | Purpose |
|-------|---------|
| `mcp_tools` | Tool contracts (name, schema, mocked, disabled) |
| `tool_implementations` | Bindings (adapter_type, connector_id, handler_key) |
| `connectors` | Backend connections (DB, API, Remote MCP) |
| `execution_records` | Audit trail (trace_id, latency, success, adapter) |

## Feature Flag

`TOOL_RUNTIME_ENABLED=true` activates the runtime path in `runner.ts` for online chat. Other channels (voice/outbound) always use runtime. Default is `false` (legacy path).

## File Structure

```
backend/src/tool-runtime/
├── index.ts              # Re-exports
├── types.ts              # Request/Result, ErrorCode, Adapter interface
├── registry.ts           # DB-backed contract/binding/connector lookup
├── pipeline.ts           # 7-step pipeline orchestrator
├── runtime.ts            # ToolRuntime class + isRuntimeEnabled()
├── adapters/
│   ├── remote-mcp-adapter.ts   # MCP pool + HTTP fallback
│   ├── mock-adapter.ts         # Delegates to mock-engine
│   ├── api-adapter.ts          # Wraps api-executor
│   ├── db-adapter.ts           # Parameterized SQL
│   └── script-adapter.ts       # Handler registry
└── policies/
    └── sop-policy.ts           # Wraps SOPGuard
```
